import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  BookingStatus,
  Prisma,
  TransactionStatus,
  TransactionType,
  UserStatus,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import {
  DashboardChartPeriod,
  DashboardAlertDto,
  DashboardChartPointDto,
  DashboardStatsDto,
} from './dto/dashboard.dto.js';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) { }

  async stats(): Promise<{ data: DashboardStatsDto }> {
    try {
      const now = new Date();
      const thisMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      const lastMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
      );

      const activeBookingStatuses = [
        BookingStatus.PENDING,
        BookingStatus.CONFIRMED,
      ];
      const pendingTransactionStatuses = [
        TransactionStatus.PENDING,
        TransactionStatus.PROCESSING,
      ];

      const [
        totalUsers,
        activeUsers,
        newUsers,
        priorUsers,
        activeBookings,
        currentBookings,
        priorBookings,
        pendingTransactions,
        currentPending,
        priorPending,
        totalRevenue,
        currentRevenue,
        priorRevenue,
      ] = await Promise.all([
        this.prisma.user.count({ where: { deletedAt: null } }),
        this.prisma.user.count({
          where: { deletedAt: null, status: UserStatus.ACTIVE },
        }),
        this.prisma.user.count({
          where: { deletedAt: null, createdAt: { gte: thisMonth } },
        }),
        this.prisma.user.count({
          where: {
            deletedAt: null,
            createdAt: { gte: lastMonth, lt: thisMonth },
          },
        }),
        this.prisma.booking.count({
          where: { status: { in: activeBookingStatuses } },
        }),
        this.prisma.booking.count({
          where: {
            status: { in: activeBookingStatuses },
            createdAt: { gte: thisMonth },
          },
        }),
        this.prisma.booking.count({
          where: {
            status: { in: activeBookingStatuses },
            createdAt: { gte: lastMonth, lt: thisMonth },
          },
        }),
        this.prisma.transaction.count({
          where: { status: { in: pendingTransactionStatuses } },
        }),
        this.prisma.transaction.count({
          where: {
            status: { in: pendingTransactionStatuses },
            createdAt: { gte: thisMonth },
          },
        }),
        this.prisma.transaction.count({
          where: {
            status: { in: pendingTransactionStatuses },
            createdAt: { gte: lastMonth, lt: thisMonth },
          },
        }),
        this.revenue(),
        this.revenue(thisMonth, now),
        this.revenue(lastMonth, thisMonth),
      ]);

      return {
        data: {
          totalUsers,
          activeUsers,
          newUsersThisMonth: newUsers,
          totalRevenue,
          currency: 'INR',
          activeBookings,
          pendingTransactions,
          usersChangePercent: this.percentChange(newUsers, priorUsers),
          revenueChangePercent: this.percentChange(
            currentRevenue,
            priorRevenue,
          ),
          bookingsChangePercent: this.percentChange(
            currentBookings,
            priorBookings,
          ),
          pendingTransactionsChangePercent: this.percentChange(
            currentPending,
            priorPending,
          ),
          asOf: now.toISOString(),
        },
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  async charts(period: DashboardChartPeriod): Promise<{
    data: {
      period: DashboardChartPeriod;
      currency: string;
      from: string;
      to: string;
      points: DashboardChartPointDto[];
    };
  }> {
    try {
      const now = new Date();
      const monthly =
        period !== DashboardChartPeriod.DAYS_7 &&
        period !== DashboardChartPeriod.MONTH_1;
      const bucketCount = this.bucketCount(period);

      const start = monthly
        ? new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth() - bucketCount + 1,
            1,
          ),
        )
        : new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() - bucketCount + 1,
          ),
        );

      const records = await this.prisma.transaction.findMany({
        where: {
          createdAt: { gte: start, lte: now },
          OR: [
            {
              type: TransactionType.PAYMENT,
              status: TransactionStatus.SUCCESS,
            },
            {
              type: TransactionType.REFUND,
              status: {
                in: [TransactionStatus.SUCCESS, TransactionStatus.REFUNDED],
              },
            },
          ],
        },
        select: { type: true, amount: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });

      const points = this.emptyPoints(start, now, monthly, bucketCount);
      const pointMap = new Map(points.map((point) => [point.date, point]));

      for (const record of records) {
        const key = monthly
          ? this.monthKey(record.createdAt)
          : this.dayKey(record.createdAt);
        const point = pointMap.get(key);
        if (!point) continue;

        const amount = Number(record.amount.toFixed(2));
        if (record.type === TransactionType.PAYMENT) {
          point.payments += amount;
        } else {
          point.refunds += amount;
        }
        point.transactionCount += 1;
      }

      for (const point of points) {
        point.payments = this.round(point.payments);
        point.refunds = this.round(point.refunds);
        point.revenue = this.round(point.payments - point.refunds);
      }

      return {
        data: {
          period,
          currency: 'INR',
          from: start.toISOString(),
          to: now.toISOString(),
          points,
        },
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  async alerts(): Promise<{ data: DashboardAlertDto[] }> {
    try {
      const now = new Date();
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [
        pendingCount,
        oldestPending,
        failedCount,
        earliestFailure,
        overdueCount,
        oldestOverdue,
      ] = await Promise.all([
        this.prisma.transaction.count({
          where: {
            status: {
              in: [TransactionStatus.PENDING, TransactionStatus.PROCESSING],
            },
          },
        }),
        this.prisma.transaction.findFirst({
          where: {
            status: {
              in: [TransactionStatus.PENDING, TransactionStatus.PROCESSING],
            },
          },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
        this.prisma.transaction.count({
          where: {
            status: TransactionStatus.FAILED,
            createdAt: { gte: dayAgo },
          },
        }),
        this.prisma.transaction.findFirst({
          where: {
            status: TransactionStatus.FAILED,
            createdAt: { gte: dayAgo },
          },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
        this.prisma.booking.count({
          where: {
            status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
            scheduledAt: { lt: now },
          },
        }),
        this.prisma.booking.findFirst({
          where: {
            status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
            scheduledAt: { lt: now },
          },
          orderBy: { scheduledAt: 'asc' },
          select: { scheduledAt: true },
        }),
      ]);

      const data: DashboardAlertDto[] = [];

      if (pendingCount > 0) {
        data.push({
          id: 'pending-transactions',
          severity: pendingCount >= 10 ? 'critical' : 'warning',
          title: `${pendingCount} transactions pending`,
          description: 'Transactions are awaiting a final status update.',
          count: pendingCount,
          occurredAt: oldestPending?.createdAt.toISOString() ?? null,
        });
      }

      if (failedCount > 0) {
        data.push({
          id: 'recent-failures',
          severity: 'warning',
          title: `${failedCount} transactions failed in the last 24 hours`,
          description:
            'Review failed transactions and resolve payment issues.',
          count: failedCount,
          occurredAt: earliestFailure?.createdAt.toISOString() ?? null,
        });
      }

      if (overdueCount > 0) {
        data.push({
          id: 'overdue-bookings',
          severity: 'critical',
          title: `${overdueCount} bookings are overdue`,
          description:
            'Pending or confirmed bookings have a scheduled time in the past.',
          count: overdueCount,
          occurredAt: oldestOverdue?.scheduledAt.toISOString() ?? null,
        });
      }

      return { data };
    } catch (error) {
      this.handleError(error);
    }
  }

  private async revenue(from?: Date, to?: Date): Promise<number> {
    const dateFilter: Prisma.DateTimeFilter | undefined =
      from || to
        ? {
          ...(from ? { gte: from } : {}),
          ...(to ? { lt: to } : {}),
        }
        : undefined;

    const [payments, refunds] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          type: TransactionType.PAYMENT,
          status: TransactionStatus.SUCCESS,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          type: TransactionType.REFUND,
          status: {
            in: [TransactionStatus.SUCCESS, TransactionStatus.REFUNDED],
          },
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
        _sum: { amount: true },
      }),
    ]);

    return this.round(
      Number(payments._sum.amount?.toString() ?? 0) -
      Number(refunds._sum.amount?.toString() ?? 0),
    );
  }

  private emptyPoints(
    start: Date,
    now: Date,
    monthly: boolean,
    count: number,
  ): DashboardChartPointDto[] {
    return Array.from({ length: count }, (_, index) => {
      const date = monthly
        ? new Date(
          Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1),
        )
        : new Date(
          Date.UTC(
            start.getUTCFullYear(),
            start.getUTCMonth(),
            start.getUTCDate() + index,
          ),
        );

      const key = monthly ? this.monthKey(date) : this.dayKey(date);

      return {
        date: key,
        label: new Intl.DateTimeFormat('en', {
          ...(monthly
            ? { month: 'short', year: 'numeric' }
            : { month: 'short', day: 'numeric' }),
          timeZone: 'UTC',
        }).format(date),
        revenue: 0,
        payments: 0,
        refunds: 0,
        transactionCount: 0,
      };
    });
  }

  private bucketCount(period: DashboardChartPeriod): number {
    switch (period) {
      case DashboardChartPeriod.DAYS_7:
        return 7;
      case DashboardChartPeriod.MONTH_1:
        return 30;
      case DashboardChartPeriod.MONTHS_3:
        return 3;
      case DashboardChartPeriod.MONTHS_6:
        return 6;
      case DashboardChartPeriod.YEAR_1:
        return 12;
    }
  }

  private dayKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private monthKey(date: Date): string {
    return date.toISOString().slice(0, 7);
  }

  private percentChange(current: number, previous: number): number | null {
    if (previous === 0) return null;
    return this.round(((current - previous) / previous) * 100, 1);
  }

  private round(value: number, places = 2): number {
    const factor = 10 ** places;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  /**
   * Centralized error handler – maps Prisma errors to NestJS HTTP exceptions
   * and ensures no internal details are leaked.
   */
  private handleError(error: unknown): never {
    // Handle Prisma known request errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new InternalServerErrorException('Database operation failed');
    }

    // Fallback for unexpected errors
    throw new InternalServerErrorException('An unexpected error occurred');
  }
}