import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStatus,
  BookingDuration as PrismaBookingDuration,
  Prisma,
  UserStatus,
} from '../../generated/prisma/client.js';
import { newId, newPublicNumber } from '../../common/database/ids.js';
import {
  getPaginationParams,
  paginationMeta,
} from '../../common/dto/pagination.dto.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import {
  BookingDurationValue,
  BookingSortBy,
  BookingStatusFilter,
  BookingWhen,
} from './dto/booking.dto.js';
import type {
  BookingListResponseDto,
  BookingsSummaryDto,
  BookingListItemDto,
  BookingDetailDto,
  BookingResponseDto,
  BookingsQueryDto,
  CreateBookingDto,
  UpdateBookingDto,
} from './dto/booking.dto.js';

const bookingInclude = {
  user: { include: { auth: { select: { email: true } } } },
} satisfies Prisma.BookingInclude;

type BookingRecord = Prisma.BookingGetPayload<{
  include: typeof bookingInclude;
}>;

@Injectable()
export class BookingService {
  constructor(private readonly prisma: PrismaService) { }

  async list(query: BookingsQueryDto): Promise<BookingListResponseDto> {
    try {
      if (query.fromDate && query.toDate && query.fromDate > query.toDate) {
        throw new BadRequestException('fromDate must be before toDate');
      }

      const search = query.search?.trim();
      const scheduledAt: Prisma.DateTimeFilter = {};

      if (query.fromDate) scheduledAt.gte = new Date(query.fromDate);
      if (query.toDate) scheduledAt.lte = new Date(query.toDate);

      if (query.when === BookingWhen.UPCOMING) {
        const now = new Date();
        if (!scheduledAt.gte || scheduledAt.gte < now) {
          scheduledAt.gte = now;
        }
      }

      if (query.when === BookingWhen.PAST) {
        scheduledAt.lt = new Date();
      }

      const where: Prisma.BookingWhereInput = {
        ...(query.status !== BookingStatusFilter.ALL
          ? { status: query.status }
          : {}),
        ...(query.when !== BookingWhen.ALL || query.fromDate || query.toDate
          ? { scheduledAt }
          : {}),
        ...(search
          ? {
            OR: [
              {
                bookingNumber: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              { service: { contains: search, mode: 'insensitive' } },
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
            ],
          }
          : {}),
      };

      const orderBy: Prisma.BookingOrderByWithRelationInput =
        query.sortBy === BookingSortBy.STATUS
          ? { status: query.sortOrder }
          : query.sortBy === BookingSortBy.BOOKING_NUMBER
            ? { bookingNumber: query.sortOrder }
            : { scheduledAt: query.sortOrder };

      const { page, limit, skip } = getPaginationParams(query);
      const now = new Date();
      const currentMonthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      const previousMonthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
      );
      const nextMonthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
      );

      const [bookings, total, allTimeCounts, currentMonthCounts, previousMonthCounts] = await Promise.all([
        this.prisma.booking.findMany({
          where,
          include: bookingInclude,
          orderBy: [orderBy, { id: 'asc' }],
          skip,
          take: limit,
        }),
        this.prisma.booking.count({ where }),
        this.prisma.booking.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.booking.groupBy({
          by: ['status'],
          where: { createdAt: { gte: currentMonthStart, lt: nextMonthStart } },
          _count: { _all: true },
        }),
        this.prisma.booking.groupBy({
          by: ['status'],
          where: { createdAt: { gte: previousMonthStart, lt: currentMonthStart } },
          _count: { _all: true },
        }),
      ]);

      const allTimeByStatus = new Map(
        allTimeCounts.map(({ status, _count }) => [status, _count._all]),
      );
      const currentByStatus = new Map(
        currentMonthCounts.map(({ status, _count }) => [status, _count._all]),
      );
      const previousByStatus = new Map(
        previousMonthCounts.map(({ status, _count }) => [status, _count._all]),
      );
      const activeStatuses = [BookingStatus.PENDING, BookingStatus.CONFIRMED];
      const completedStatuses = [BookingStatus.COMPLETED];
      const cancelledStatuses = [BookingStatus.CANCELLED];
      const summary = this.bookingsSummary(
        allTimeByStatus,
        currentByStatus,
        previousByStatus,
        activeStatuses,
        completedStatuses,
        cancelledStatuses,
      );

      return {
        data: {
          bookings: bookings.map((booking) => this.toListDto(booking)),
          bookingsSummary: summary,
        },
        meta: paginationMeta(page, limit, total),
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  async get(id: string): Promise<{ data: BookingDetailDto }> {
    try {
      const booking = await this.prisma.booking.findFirst({
        where: this.identifierWhere(id),
        include: bookingInclude,
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      const completedBookings = await this.prisma.booking.count({
        where: {
          userId: booking.userId,
          status: BookingStatus.COMPLETED,
        },
      });

      return { data: this.toDetailDto(booking, completedBookings) };
    } catch (error) {
      this.handleError(error);
    }
  }

  private toDetailDto(
    booking: BookingRecord,
    completedBookings: number,
  ): BookingDetailDto {
    return {
      id: booking.id,
      bookingNumber: `#${booking.bookingNumber}`,
      service: booking.service,
      amount: Number(booking.amount.toFixed(2)),
      duration: this.toDetailDuration(booking.duration),
      date: booking.scheduledAt.toISOString(),
      status: booking.status,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
      user: {
        id: booking.user.id,
        fullName: [booking.user.firstName, booking.user.lastName]
          .filter(Boolean)
          .join(' '),
        email: booking.user.auth?.email ?? null,
        completedBookings,
      },
    };
  }

  private toDetailDuration(
    duration: PrismaBookingDuration,
  ): BookingDetailDto['duration'] {
    switch (duration) {
      case PrismaBookingDuration.ONE_HOUR:
        return '60_MINUTES';
      case PrismaBookingDuration.ONE_AND_HALF_HOURS:
        return '90_MINUTES';
      case PrismaBookingDuration.TWO_HOURS:
        return '120_MINUTES';
    }
  }

  async create(
    input: CreateBookingDto,
  ): Promise<{ data: BookingResponseDto }> {
    try {
      const userId = input.userId;
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findFirst({
          where: {
            id: userId,
            deletedAt: null,
            status: UserStatus.ACTIVE,
          },
          select: { id: true },
        });

        if (!user) {
          throw new NotFoundException('Active user not found');
        }

        const booking = await tx.booking.create({
          data: {
            id: newId(),
            bookingNumber: newPublicNumber('BKG'),
            userId,
            service: input.service.trim(),
            amount: new Prisma.Decimal(input.amount.toFixed(2)),
            duration: this.toPrismaDuration(input.duration),
            scheduledAt: new Date(input.date),
            status: BookingStatus.PENDING,
          },
          include: bookingInclude,
        });

        return { data: this.toDto(booking) };
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  async update(
    id: string,
    input: UpdateBookingDto,
  ): Promise<{ data: BookingResponseDto }> {
    try {
      if (Object.values(input).every((value) => value === undefined)) {
        throw new BadRequestException('At least one field is required');
      }

      const existing = await this.prisma.booking.findFirst({
        where: this.identifierWhere(id),
        select: { id: true },
      });

      if (!existing) {
        throw new NotFoundException('Booking not found');
      }

      return await this.prisma.$transaction(async (tx) => {
        const booking = await tx.booking.update({
          where: { id: existing.id },
          data: {
            ...(input.service !== undefined
              ? { service: input.service.trim() }
              : {}),
            ...(input.amount !== undefined
              ? { amount: new Prisma.Decimal(input.amount.toFixed(2)) }
              : {}),
            ...(input.duration !== undefined
              ? { duration: this.toPrismaDuration(input.duration) }
              : {}),
            ...(input.date
              ? { scheduledAt: new Date(input.date) }
              : {}),
            ...(input.status ? { status: input.status } : {}),
          },
          include: bookingInclude,
        });

        return { data: this.toDto(booking) };
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  private bookingsSummary(
    allTimeCounts: Map<BookingStatus, number>,
    currentMonthCounts: Map<BookingStatus, number>,
    previousMonthCounts: Map<BookingStatus, number>,
    activeStatuses: BookingStatus[],
    completedStatuses: BookingStatus[],
    cancelledStatuses: BookingStatus[],
  ): BookingsSummaryDto {
    const metric = (statuses: BookingStatus[]) => {
      const count = this.countStatuses(allTimeCounts, statuses);
      const currentCount = this.countStatuses(currentMonthCounts, statuses);
      const previousCount = this.countStatuses(previousMonthCounts, statuses);

      return {
        count,
        changeVsLastMonth:
          previousCount === 0
            ? currentCount === 0
              ? 0
              : null
            : Number(
              (((currentCount - previousCount) / previousCount) * 100).toFixed(1),
            ),
        changeUnit: 'percent' as const,
      };
    };

    return {
      totalBookings: metric(Object.values(BookingStatus)),
      activeBookings: metric(activeStatuses),
      completedBookings: metric(completedStatuses),
      cancelledBookings: metric(cancelledStatuses),
    };
  }

  private toPrismaDuration(duration: BookingDurationValue): PrismaBookingDuration {
    switch (duration) {
      case BookingDurationValue.ONE_HOUR:
        return PrismaBookingDuration.ONE_HOUR;
      case BookingDurationValue.ONE_AND_HALF_HOURS:
        return PrismaBookingDuration.ONE_AND_HALF_HOURS;
      case BookingDurationValue.TWO_HOURS:
        return PrismaBookingDuration.TWO_HOURS;
    }
  }

  private countStatuses(
    counts: Map<BookingStatus, number>,
    statuses: BookingStatus[],
  ): number {
    return statuses.reduce((total, status) => total + (counts.get(status) ?? 0), 0);
  }

  private identifierWhere(id: string): Prisma.BookingWhereInput {
    return id.toUpperCase().startsWith('BKG-')
      ? { bookingNumber: id.toUpperCase() }
      : { id };
  }

  private toDto(booking: BookingRecord): BookingResponseDto {
    return {
      id: booking.id,
      bookingNumber: booking.bookingNumber,
      user: {
        id: booking.user.id,
        firstName: booking.user.firstName,
        lastName: booking.user.lastName,
        email: booking.user.auth?.email ?? null,
      },
      service: booking.service,
      userId: booking.userId,
      amount: Number(booking.amount.toFixed(2)),
      duration: this.fromPrismaDuration(booking.duration),
      date: booking.scheduledAt.toISOString(),
      scheduledAt: booking.scheduledAt.toISOString(),
      status: booking.status,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
    };
  }

  private toListDto(booking: BookingRecord): BookingListItemDto {
    const scheduledDate = booking.scheduledAt.toISOString();

    return {
      id: booking.id,
      bookingNumber: booking.bookingNumber,
      user: {
        id: booking.user.id,
        name: [booking.user.firstName, booking.user.lastName]
          .filter(Boolean)
          .join(' '),
        profileImage: booking.user.profileImage,
      },
      service: booking.service,
      date: scheduledDate.slice(0, 10),
      time: scheduledDate.slice(11, 16),
      duration: this.fromPrismaDuration(booking.duration),
      status: booking.status,
      amount: Number(booking.amount.toFixed(2)),
    };
  }

  private fromPrismaDuration(duration: PrismaBookingDuration): BookingDurationValue {
    switch (duration) {
      case PrismaBookingDuration.ONE_HOUR:
        return BookingDurationValue.ONE_HOUR;
      case PrismaBookingDuration.ONE_AND_HALF_HOURS:
        return BookingDurationValue.ONE_AND_HALF_HOURS;
      case PrismaBookingDuration.TWO_HOURS:
        return BookingDurationValue.TWO_HOURS;
    }
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

    if (target.includes('bookingNumber')) {
      return 'Booking number already exists';
    }

    return 'A record with the provided data already exists';
  }
}