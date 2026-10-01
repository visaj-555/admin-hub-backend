import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import {
  Prisma,
  TransactionType,
  UserStatus,
} from '../../generated/prisma/client.js';
import { newId } from '../../common/utils/ids.js';
import {
  getPaginationParams,
  paginationMeta,
} from '../../common/dto/pagination.dto.js';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CreateUserDto,
  UpdateUserDto,
  UserListResponseDto,
  UserDetailDto,
  UserResponseDto,
  UserAnalysisDto,
  UsersQueryDto,
} from './dto/user.dto.js';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) { }

  async list(query: UsersQueryDto): Promise<UserListResponseDto> {
    if (query.fromDate && query.toDate && query.fromDate > query.toDate) {
      throw new BadRequestException('fromDate must be before toDate');
    }

    const search = query.search?.trim();
      const where: Prisma.UserWhereInput = {
        deletedAt: null,
        ...(query.role ? { role: query.role } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.fromDate || query.toDate
          ? {
            createdAt: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
          : {}),
        ...(search
          ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              {
                auth: {
                  is: { email: { contains: search, mode: 'insensitive' } },
                },
              },
            ],
          }
          : {}),
      };

      const orderBy: Prisma.UserOrderByWithRelationInput =
        query.sortBy === 'name'
          ? { firstName: query.sortOrder }
          : { createdAt: query.sortOrder };

      const { page, limit, skip } = getPaginationParams(query);
      const currentDate = new Date();
      const monthStart = new Date(
        Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), 1),
      );
      const nextMonthStart = new Date(
        Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth() + 1, 1),
      );

      const [users, total, totalUsers, activeUsers, newThisMonth] =
        await Promise.all([
          this.prisma.user.findMany({
            where,
            include: { auth: { select: { email: true } } },
            orderBy: [orderBy, { id: 'asc' }],
            skip,
            take: limit,
          }),
          this.prisma.user.count({ where }),
          this.prisma.user.count({ where: { deletedAt: null } }),
          this.prisma.user.count({
            where: { deletedAt: null, status: UserStatus.ACTIVE },
          }),
          this.prisma.user.count({
            where: {
              deletedAt: null,
              createdAt: { gte: monthStart, lt: nextMonthStart },
            },
          }),
        ]);

      return {
        data: users.map((user) => this.toDto(user)),
        meta: paginationMeta(page, limit, total),
        analysis: { totalUsers, activeUsers, newThisMonth } satisfies UserAnalysisDto,
      };
  }

  async get(id: string): Promise<{ data: UserDetailDto }> {
    try {
      const user = await this.prisma.user.findFirst({
        where: { id, deletedAt: null },
        include: {
          auth: { select: { email: true, lastLoginAt: true } },
          bookings: { orderBy: { createdAt: 'desc' }, take: 5 },
          transactions: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      return { data: this.toDetailDto(user) };
    } catch (error) {
      throw error;
    }
  }

  async create(
    input: CreateUserDto,
    profileImage?: string,
  ): Promise<{ data: UserResponseDto }> {
    try {
      const password = await hash(input.password, 12);
      const id = newId();

      return await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            id,
            firstName: input.firstName.trim(),
            lastName: input.lastName?.trim() || null,
            phone: input.phone?.trim() || null,
            profileImage: profileImage ?? null,
            role: input.role,
            status: UserStatus.ACTIVE,
          },
        });

        await transaction.auth.create({
          data: {
            id: newId(),
            userId: id,
            email: input.email.toLowerCase(),
            passwordHash: password,
          },
        });

        return {
          data: this.toDto({
            ...user,
            auth: { email: input.email.toLowerCase() },
          }),
        };
      });
    } catch (error) {
      throw error;
    }
  }

  async update(
    id: string,
    input: UpdateUserDto,
    profileImage?: string,
  ): Promise<{ data: UserResponseDto }> {
    try {
      if (
        profileImage === undefined &&
        Object.values(input).every((value) => value === undefined)
      ) {
        throw new BadRequestException('At least one field is required');
      }

      const current = await this.prisma.user.findFirst({
        where: { id, deletedAt: null },
        include: { auth: { select: { email: true } } },
      });

      if (!current) {
        throw new NotFoundException('User not found');
      }

      if (input.email && !current.auth) {
        throw new ConflictException('User has no authentication account');
      }

      return await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.update({
          where: { id },
          data: {
            ...(input.firstName !== undefined
              ? { firstName: input.firstName.trim() }
              : {}),
            ...(input.lastName !== undefined
              ? { lastName: input.lastName?.trim() || null }
              : {}),
            ...(input.phone !== undefined
              ? { phone: input.phone?.trim() || null }
              : {}),
            ...(profileImage !== undefined ? { profileImage } : {}),
            ...(input.role ? { role: input.role } : {}),
            ...(input.status ? { status: input.status } : {}),
          },
        });

        const email = input.email?.toLowerCase() ?? current.auth?.email ?? null;

        if (input.email) {
          await transaction.auth.update({
            where: { userId: id },
            data: { email: input.email.toLowerCase() },
          });
        }

        return {
          data: this.toDto({ ...user, auth: email ? { email } : null }),
        };
      });
    } catch (error) {
      throw error;
    }
  }

  async remove(
    id: string,
    actor: JwtPayload,
  ): Promise<{ data: { id: string; deletedAt: string } }> {
    try {
      if (id === actor.sub) {
        throw new ConflictException('You cannot delete your own account');
      }

      const user = await this.prisma.user.findFirst({
        where: { id, deletedAt: null },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      const removedAt = new Date();

      await this.prisma.user.update({
        where: { id, deletedAt: null },
        data: {
          deletedAt: removedAt,
          status: UserStatus.INACTIVE,
        },
      });

      return {
        data: {
          id,
          deletedAt: removedAt.toISOString(),
        },
      };
    } catch (error) {
      throw error;
    }
  }

  private toDto(user: {
    id: string;
    firstName: string;
    lastName: string | null;
    phone: string | null;
    profileImage: string | null;
    role: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    auth: { email: string } | null;
  }): UserResponseDto {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.auth?.email ?? null,
      phone: user.phone,
      profileImage: user.profileImage,
      role: user.role as UserResponseDto['role'],
      status: user.status as UserResponseDto['status'],
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  private toDetailDto(user: {
    id: string;
    firstName: string;
    lastName: string | null;
    phone: string | null;
    profileImage: string | null;
    createdAt: Date;
    auth: { email: string; lastLoginAt: Date | null } | null;
    bookings: Array<{
      bookingNumber: string;
      scheduledAt: Date;
      status: string;
      createdAt: Date;
    }>;
    transactions: Array<{
      transactionNumber: string;
      amount: Prisma.Decimal;
      currency: string;
      status: string;
      type: TransactionType;
      createdAt: Date;
    }>;
  }): UserDetailDto {
    const activity = [
      ...user.bookings.map((booking) => ({
        occurredAt: booking.createdAt,
        activity: 'Created booking',
        referenceId: `#${booking.bookingNumber}`,
        description: `Scheduled for ${booking.scheduledAt.toISOString()}`,
      })),
      ...user.transactions.map((transaction) => ({
        occurredAt: transaction.createdAt,
        activity:
          transaction.status === 'SUCCESS'
            ? 'Completed transaction'
            : 'Created transaction',
        referenceId: `#${transaction.transactionNumber}`,
        description: `${transaction.currency.trim()} ${transaction.amount.toFixed(2)} (${transaction.status})`,
      })),
      ...(user.auth?.lastLoginAt
        ? [{
          occurredAt: user.auth.lastLoginAt,
          activity: 'Logged in',
        }]
        : []),
    ]
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
      .slice(0, 5)
      .map(({ occurredAt, ...entry }) => ({
        ...entry,
        date: occurredAt.toISOString(),
        time: this.relativeTime(occurredAt),
      }));

    return {
      personalInformation: {
        fullName: [user.firstName, user.lastName].filter(Boolean).join(' '),
        emailAddress: user.auth?.email ?? null,
        phoneNumber: user.phone,
        profileImage: user.profileImage,
        dateOfBirth: null,
        mailingAddress: null,
      },
      accountInformation: {
        userId: user.id,
        joinedDate: user.createdAt.toISOString(),
        lastLoginActivity: user.auth?.lastLoginAt
          ? this.relativeTime(user.auth.lastLoginAt)
          : null,
        twoFactorSecurity: false,
      },
      recentActivityLog: activity,
      recentTransactions: user.transactions.map((transaction) => {
        const amount = Number(transaction.amount.toFixed(2));
        return {
          id: `#${transaction.transactionNumber}`,
          amount:
            transaction.type === TransactionType.REFUND ? -amount : amount,
          currency: transaction.currency.trim(),
          status: transaction.status,
          date: transaction.createdAt.toISOString(),
        };
      }),
      recentBookings: user.bookings.map((booking) => ({
        id: `#${booking.bookingNumber}`,
        service: 'Booking',
        status: booking.status,
        date: booking.scheduledAt.toISOString(),
        time: new Intl.DateTimeFormat('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'UTC',
        }).format(booking.scheduledAt),
      })),
    };
  }

  private relativeTime(date: Date): string {
    const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
}