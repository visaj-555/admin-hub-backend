import { Injectable, Logger } from '@nestjs/common';
import { NotificationType } from 'generated/prisma/enums';
import { NotificationService } from 'src/modules/notification/notification.service';
import { PrismaService } from 'src/common/database/prisma.service';

export const STREAK_ACHIEVEMENT_DAYS = 10;

@Injectable()
export class StreakAchieveService {
  private readonly logger = new Logger(StreakAchieveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  async notifyMilestoneIfReached(
    userId: string,
    streakCount: number,
  ): Promise<void> {
    if (streakCount !== STREAK_ACHIEVEMENT_DAYS) {
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });

    if (!user) {
      return;
    }

    const name =
      user.firstName.trim() || `${user.firstName} ${user.lastName}`.trim();
    const title = 'Streak Milestone';
    const message = `🏆 Well done, ${name}! You've reached a ${streakCount}-day good deed milestone.`;

    const alreadySent = await this.prisma.notification.findFirst({
      where: {
        userId,
        type: NotificationType.STREAK_ACHIEVEMENT,
        message,
      },
      select: { id: true },
    });

    if (alreadySent) {
      return;
    }

    await this.notificationService.createAndSend({
      userId,
      type: NotificationType.STREAK_ACHIEVEMENT,
      title,
      message,
    });

    this.logger.log(
      `Streak achievement notification sent to user ${userId} for ${streakCount}-day milestone`,
    );
  }
}
