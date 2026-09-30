import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../database/prisma.service';
import { EventBridgeSchedulerService } from '../aws/eventbridge-scheduler.service';

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

@Injectable()
export class ReminderScheduleService implements OnModuleInit {
  private readonly logger = new Logger(ReminderScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: EventBridgeSchedulerService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.REMINDER_SCHEDULE_BACKFILL !== 'true') {
      return;
    }

    try {
      await this.backfillUserSchedules();
    } catch (error) {
      this.logger.error(
        `Reminder schedule backfill failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async ensureUserSchedules(userId: string, timezone?: string): Promise<void> {
    const zone = this.normalizeTimezone(timezone);

    try {
      const reminder = await this.upsertReminderRow(userId);
      if (!reminder) {
        return;
      }

      await this.scheduler.upsertUserSchedules(userId, reminder.id, zone);
    } catch (error) {
      this.logger.error(
        `Failed to upsert EventBridge schedules for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async disableUserSchedules(userId: string, timezone?: string): Promise<void> {
    const reminder = await this.prisma.userReminder.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!reminder) {
      return;
    }

    const zone = this.normalizeTimezone(timezone);

    try {
      await this.scheduler.disableUserSchedules(userId, reminder.id, zone);
    } catch (error) {
      this.logger.error(
        `Failed to disable EventBridge schedules for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async deleteUserSchedules(userId: string): Promise<void> {
    try {
      await this.scheduler.deleteUserSchedules(userId);
    } catch (error) {
      this.logger.error(
        `Failed to delete EventBridge schedules for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private normalizeTimezone(timezone?: string | null): string {
    const zone = timezone?.trim() || DEFAULT_TIMEZONE;
    return DateTime.now().setZone(zone).isValid ? zone : DEFAULT_TIMEZONE;
  }

  private async upsertReminderRow(
    userId: string,
  ): Promise<{ id: string } | null> {
    const existing = await this.prisma.userReminder.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (existing) {
      return existing;
    }

    const epoch = new Date(0);

    try {
      const created = await this.prisma.userReminder.create({
        data: { userId },
        select: { id: true },
      });
      return created;
    } catch {
      this.logger.warn(
        `UserReminder create without next* timestamps failed for ${userId}; retrying with timestamps`,
      );
    }

    try {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO "UserReminder" (
          id,
          "userId",
          "nextMorningReminderAt",
          "nextEveningReminderAt",
          "nextStreakReminderAt",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          gen_random_uuid()::text,
          ${userId},
          ${epoch},
          ${epoch},
          ${epoch},
          NOW(),
          NOW()
        )
        ON CONFLICT ("userId") DO UPDATE
        SET "updatedAt" = "UserReminder"."updatedAt"
        RETURNING id
      `;

      return rows[0] ?? null;
    } catch (error) {
      this.logger.error(
        `Failed to create UserReminder for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private async backfillUserSchedules(): Promise<void> {
    this.logger.log('Starting EventBridge reminder schedule backfill...');

    const batchSize = 100;
    let cursor: string | undefined;
    let processed = 0;

    while (true) {
      const users = await this.prisma.user.findMany({
        take: batchSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
        select: {
          id: true,
          timezone: true,
        },
      });

      if (users.length === 0) {
        break;
      }

      for (const user of users) {
        await this.ensureUserSchedules(user.id, user.timezone);
        processed += 1;
      }

      cursor = users[users.length - 1].id;
    }

    this.logger.log(
      `EventBridge reminder schedule backfill complete for ${processed} user(s).`,
    );
  }
}
