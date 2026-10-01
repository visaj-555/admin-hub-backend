import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  TransactionStatus,
  Prisma,
  TransactionType,
  UserStatus,
} from '../../generated/prisma/client.js';
import { newId, newPublicNumber } from '../../common/utils/ids.js';
import {
  getPaginationParams,
  paginationMeta,
} from '../../common/dto/pagination.dto.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  TransactionAmountRange,
  TransactionDateRange,
  TransactionDetailDto,
  TransactionSortBy,
} from './dto/transaction.dto.js';
import type {
  CreateTransactionDto,
  TransactionListResponseDto,
  TransactionDetailResponseDto,
  TransactionResponseDto,
  TransactionsQueryDto,
  UpdateTransactionStatusDto,
} from './dto/transaction.dto.js';

@Injectable()
export class TransactionService {
  constructor(private readonly prisma: PrismaService) { }

  async list(query: TransactionsQueryDto): Promise<TransactionListResponseDto> {
    try {
      if (query.fromDate && query.toDate && query.fromDate > query.toDate) {
        throw new BadRequestException('fromDate must be before toDate');
      }

      const search = query.search?.trim();
      const dateFilter = this.dateFilter(query);
      const amountFilter = this.amountFilter(query.amount);

      const where: Prisma.TransactionWhereInput = {
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(dateFilter ? { createdAt: dateFilter } : {}),
        ...(amountFilter ? { amount: amountFilter } : {}),
        ...(search
          ? {
            OR: [
              {
                transactionNumber: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                user: {
                  firstName: { contains: search, mode: 'insensitive' },
                },
              },
              {
                user: {
                  lastName: { contains: search, mode: 'insensitive' },
                },
              },
              {
                user: {
                  auth: {
                    is: {
                      email: { contains: search, mode: 'insensitive' },
                    },
                  },
                },
              },
            ],
          }
          : {}),
      };

      const { page, limit, skip } = getPaginationParams(query);

      const [transactions, total, aggregate, successfulTransactions] = await Promise.all([
        this.prisma.transaction.findMany({
          where,
          include: {
            user: { include: { auth: { select: { email: true } } } },
            booking: { select: { bookingNumber: true } },
          },
          orderBy: [
            this.orderBy(query.sortBy, query.sortOrder),
            { id: 'asc' },
          ],
          skip,
          take: limit,
        }),
        this.prisma.transaction.count({ where }),
        this.prisma.transaction.aggregate({
          where,
          _avg: { amount: true },
          _sum: { amount: true },
        }),
        this.prisma.transaction.count({
          where: { ...where, status: TransactionStatus.SUCCESS },
        }),
      ]);

      const averageTransactionAmount = Number(
        aggregate._avg.amount?.toFixed(2) ?? 0,
      );
      const totalVolume = Number(aggregate._sum.amount?.toFixed(2) ?? 0);

      return {
        data: transactions.map((transaction) => this.toDto(transaction)),
        meta: paginationMeta(page, limit, total),
        cards: {
          totalTransactions: total,
          averageTransactionAmount,
          totalVolume,
          successRate:
            total === 0
              ? 0
              : Number(((successfulTransactions / total) * 100).toFixed(2)),
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async get(id: string): Promise<{ data: TransactionDetailResponseDto }> {
    try {
      const transaction = await this.prisma.transaction.findFirst({
        where: this.identifierWhere(id),
        include: {
          user: { include: { auth: { select: { email: true } } } },
          booking: { select: { bookingNumber: true } },
        },
      });

      if (!transaction) {
        throw new NotFoundException('Transaction not found');
      }

      return {
        data: {
          transaction: this.toDetailDto(transaction),
        },
      };
    } catch (error) {
      throw error;
    }
  }

  private toDetailDto(
    transaction: Prisma.TransactionGetPayload<{
      include: {
        user: { include: { auth: { select: { email: true } } } };
        booking: { select: { bookingNumber: true } };
      };
    }>,
  ): TransactionDetailDto {
    const amount = Number(transaction.amount.toFixed(2));
    const isRefund = transaction.type === TransactionType.REFUND;
    const status = this.statusLabel(transaction.status);

    return {
      id: `#${transaction.transactionNumber}`,
      status,
      generatedAt: new Date().toISOString(),
      invoiceDetails: {
        transactionType: this.typeLabel(transaction.type),
        product: transaction.booking
          ? `Booking ${transaction.booking.bookingNumber}`
          : null,
        processingGatewayFee: null,
        subtotal: amount,
        grandTotal: isRefund ? -amount : amount,
        currency: transaction.currency.trim(),
      },
      customerProfile: {
        fullName: [transaction.user.firstName, transaction.user.lastName]
          .filter(Boolean)
          .join(' '),
        email: transaction.user.auth?.email ?? null,
        userId: transaction.user.id,
      },
      processingHistory: [
        {
          status,
          description: `Transaction status is ${status}`,
          timestamp: transaction.updatedAt.toISOString(),
        },
        ...(transaction.updatedAt.getTime() !== transaction.createdAt.getTime()
          ? [{
            status: 'Initiated',
            description: 'Transaction record created',
            timestamp: transaction.createdAt.toISOString(),
          }]
          : []),
      ],
    };
  }

  private typeLabel(type: TransactionType): string {
    return type.charAt(0) + type.slice(1).toLowerCase();
  }

  private statusLabel(status: TransactionStatus): string {
    switch (status) {
      case TransactionStatus.SUCCESS:
        return 'Succeeded';
      case TransactionStatus.REFUNDED:
        return 'Refunded';
      case TransactionStatus.PROCESSING:
        return 'Processing';
      case TransactionStatus.FAILED:
        return 'Failed';
      default:
        return 'Pending';
    }
  }

  async create(
    input: CreateTransactionDto,
    userId: string,
  ): Promise<{ data: TransactionResponseDto }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findFirst({
          where: {
            id: userId,
            deletedAt: null,
            status: { not: UserStatus.SUSPENDED },
          },
          select: { id: true },
        });

        if (!user) {
          throw new NotFoundException('Active user not found');
        }

        if (input.bookingId) {
          const booking = await tx.booking.findFirst({
            where: { id: input.bookingId, userId },
            select: { id: true },
          });

          if (!booking) {
            throw new NotFoundException('Booking not found for this user');
          }
        }

        const created = await tx.transaction.create({
          data: {
            id: newId(),
            transactionNumber: newPublicNumber('TXN'),
            userId,
            bookingId: input.bookingId ?? null,
            type: input.type,
            status: input.status,
            amount: new Prisma.Decimal(input.amount.toFixed(2)),
            currency: input.currency.toUpperCase(),
          },
          include: {
            user: { include: { auth: { select: { email: true } } } },
            booking: { select: { bookingNumber: true } },
          },
        });

        return { data: this.toDto(created) };
      });
    } catch (error) {
      throw error;
    }
  }

  async updateStatus(
    id: string,
    input: UpdateTransactionStatusDto,
  ): Promise<{ data: TransactionResponseDto }> {
    try {
      const existing = await this.prisma.transaction.findFirst({
        where: this.identifierWhere(id),
      });

      if (!existing) {
        throw new NotFoundException('Transaction not found');
      }

      const updated = await this.prisma.transaction.update({
        where: { id: existing.id },
        data: { status: input.status },
        include: {
          user: { include: { auth: { select: { email: true } } } },
          booking: { select: { bookingNumber: true } },
        },
      });

      return { data: this.toDto(updated) };
    } catch (error) {
      throw error;
    }
  }

  private identifierWhere(id: string): Prisma.TransactionWhereInput {
    return id.toUpperCase().startsWith('TXN-')
      ? { transactionNumber: id.toUpperCase() }
      : { id };
  }

  private dateFilter(
    query: TransactionsQueryDto,
  ): Prisma.DateTimeFilter | undefined {
    if (query.fromDate || query.toDate) {
      return {
        ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
        ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
      };
    }

    if (query.dateRange === TransactionDateRange.LAST_30_DAYS) {
      const from = new Date();
      from.setDate(from.getDate() - 30);
      return { gte: from };
    }

    return undefined;
  }

  private amountFilter(
    range?: TransactionAmountRange,
  ): Prisma.DecimalFilter<'Transaction'> | undefined {
    if (!range || range === TransactionAmountRange.ALL) return undefined;
    if (range === TransactionAmountRange.UNDER_1000) return { lt: 1000 };
    if (range === TransactionAmountRange.FROM_1000_TO_10000) {
      return { gte: 1000, lte: 10_000 };
    }
    if (range === TransactionAmountRange.OVER_10000) return { gt: 10_000 };
    return undefined;
  }

  private orderBy(
    field: TransactionSortBy,
    direction: 'asc' | 'desc',
  ): Prisma.TransactionOrderByWithRelationInput {
    switch (field) {
      case TransactionSortBy.AMOUNT:
        return { amount: direction };
      case TransactionSortBy.STATUS:
        return { status: direction };
      case TransactionSortBy.TRANSACTION_NUMBER:
        return { transactionNumber: direction };
      default:
        return { createdAt: direction };
    }
  }

  private toDto(transaction: {
    id: string;
    transactionNumber: string;
    type: TransactionType;
    status: TransactionResponseDto['status'];
    amount: Prisma.Decimal;
    currency: string;
    createdAt: Date;
    updatedAt: Date;
    user: {
      id: string;
      firstName: string;
      lastName: string | null;
      profileImage: string | null;
      auth: { email: string } | null;
    };
    booking: { bookingNumber: string } | null;
  }): TransactionResponseDto {
    const amount = Number(transaction.amount.toFixed(2));

    return {
      id: transaction.id,
      transactionNumber: transaction.transactionNumber,
      type: transaction.type,
      status: transaction.status,
      amount: transaction.type === TransactionType.REFUND ? -amount : amount,
      currency: transaction.currency.trim(),
      user: {
        id: transaction.user.id,
        firstName: transaction.user.firstName,
        lastName: transaction.user.lastName,
        email: transaction.user.auth?.email ?? null,
        profileImage: transaction.user.profileImage,
      },
      bookingNumber: transaction.booking?.bookingNumber ?? null,
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
    };
  }

  /**
   * Centralized error handler – maps Prisma errors to NestJS HTTP exceptions
   * and ensures no internal details are leaked.
   */
  private handleError(error: unknown): never {
    // Re-throw NestJS HTTP exceptions as-is
    if (
      error instanceof BadRequestException ||
      error instanceof NotFoundException ||
      error instanceof ConflictException
    ) {
      throw error;
    }

    // Handle Prisma known request errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case 'P2002': // Unique constraint violation
          throw new ConflictException(
            this.getUniqueConstraintMessage(error),
          );
        case 'P2025': // Record not found
          throw new NotFoundException('Record not found');
        case 'P2003': // Foreign key constraint failed
          throw new BadRequestException('Related record does not exist');
        case 'P2014': // Invalid ID / relation violation
          throw new BadRequestException('Invalid relation');
        default:
          throw new InternalServerErrorException('Database operation failed');
      }
    }

    // Fallback for unexpected errors
    throw new InternalServerErrorException('An unexpected error occurred');
  }

  /**
   * Builds a user-friendly message for unique constraint violations.
   */
  private getUniqueConstraintMessage(
    error: Prisma.PrismaClientKnownRequestError,
  ): string {
    const target = (error.meta?.target as string[]) ?? [];

    if (target.includes('transactionNumber')) {
      return 'Transaction number already exists';
    }

    return 'A record with the provided data already exists';
  }
}