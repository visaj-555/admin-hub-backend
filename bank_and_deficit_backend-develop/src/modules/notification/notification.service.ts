import { Injectable, Logger } from '@nestjs/common';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { NotificationType } from 'generated/prisma/enums';
import { Prisma } from 'generated/prisma/client';

import { S3Service } from 'src/common/aws/s3.service';
import { calculatePaginationMeta } from 'src/common/common.exports';
import { PrismaService } from 'src/common/database/prisma.service';
import { PostMediaResponseDto } from '../post/dto/responses/post.create.response';
import { RedisService } from '../redis/redis.service';
import {
  CreateNotificationInput,
  UpsertNotificationInput,
} from './dto/notification.dto';
import { NotificationListResponseDto } from './dto/notification.response.dto';
import { FirebaseService } from './firebase.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly wsClient: ApiGatewayManagementApiClient | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly redis: RedisService,
    private readonly firebaseService: FirebaseService,
  ) {
    const wsEndpoint = process.env.WEBSOCKET_API_ENDPOINT;
    if (wsEndpoint) {
      this.wsClient = new ApiGatewayManagementApiClient({
        endpoint: wsEndpoint,
        region: process.env.AWS_REGION ?? 'us-east-1',
      });
    } else {
      this.logger.warn(
        'WEBSOCKET_API_ENDPOINT not configured, real-time notification broadcasting disabled',
      );
      this.wsClient = null;
    }
  }

  private userKey(userId: string): string {
    return `ws:user:${userId}`;
  }

  async createAndSend(input: CreateNotificationInput): Promise<void> {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId: input.userId,
          actorId: input.actorId ?? null,
          postId: input.postId ?? null,
          type: input.type,
          title: input.title,
          message: input.message,
        },
      });

      const payload = await this.mapNotificationForClient(notification.id);
      if (payload) {
        await this.sendRealtimeNotification(input.userId, payload);
      }

      await this.sendPushNotification(
        input.userId,
        input.title,
        input.message,
        {
          notificationId: notification.id,
          type: input.type,
          postId: input.postId ?? '',
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to create/send notification (type=${input.type}, userId=${input.userId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async upsertAndSend(input: UpsertNotificationInput): Promise<void> {
    try {
      const existing = await this.prisma.notification.findFirst({
        where: input.upsertKey,
        select: { id: true },
      });

      const notification = existing
        ? await this.prisma.notification.update({
            where: { id: existing.id },
            data: {
              title: input.title,
              message: input.message,
              isRead: false,
              createdAt: new Date(),
            },
          })
        : await this.prisma.notification.create({
            data: {
              userId: input.userId,
              actorId: input.actorId ?? null,
              postId: input.postId ?? null,
              type: input.type,
              title: input.title,
              message: input.message,
            },
          });

      const payload = await this.mapNotificationForClient(notification.id);
      if (payload) {
        await this.sendRealtimeNotification(input.userId, payload);
      }

      await this.sendPushNotification(
        input.userId,
        input.title,
        input.message,
        {
          notificationId: notification.id,
          type: input.type,
          postId: input.postId ?? '',
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to upsert/send notification (type=${input.type}, userId=${input.userId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async deleteNotifications(
    where: Prisma.NotificationWhereInput,
  ): Promise<void> {
    await this.prisma.notification.deleteMany({ where });
  }

  private async mapNotificationForClient(notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: {
        actor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
          },
        },
        post: {
          include: {
            media: {
              where: { isTemp: false },
              take: 1,
            },
          },
        },
      },
    });

    if (!notification) {
      return null;
    }

    let media: PostMediaResponseDto | null = null;

    if (
      notification.type === NotificationType.POST_CHEERED &&
      notification.post?.media?.length
    ) {
      const item = notification.post.media[0];

      media = new PostMediaResponseDto();
      media.id = item.id;
      media.type = item.type;
      media.mimeType = item.mimeType;
      media.size = item.size;
      media.url = await this.s3Service.getSignedUrl(item.url);
      media.thumbnailUrl = item.thumbnailUrl
        ? await this.s3Service.getSignedUrl(item.thumbnailUrl)
        : null;
    }

    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      postId: notification.postId,
      media,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
      actor: notification.actor
        ? {
            id: notification.actor.id,
            fullName:
              `${notification.actor.firstName} ${notification.actor.lastName}`.trim(),
            profileImage: notification.actor.profileImage
              ? await this.s3Service.getSignedUrl(
                  notification.actor.profileImage,
                )
              : null,
          }
        : null,
    };
  }

  private async sendRealtimeNotification(
    userId: string,
    notification: Record<string, unknown>,
  ): Promise<void> {
    const client = this.wsClient;
    if (!client) {
      return;
    }

    try {
      const connectionIds = await this.redis.smembers(this.userKey(userId));

      if (connectionIds.length === 0) {
        return;
      }

      const sendPromises = connectionIds.map((connectionId) =>
        client
          .send(
            new PostToConnectionCommand({
              ConnectionId: connectionId,
              Data: JSON.stringify({
                type: 'notification',
                data: notification,
              }),
            }),
          )
          .catch((error) => {
            this.logger.debug(
              `Failed to send notification to connection ${connectionId}: ${
                error instanceof Error ? error.message : 'Unknown'
              }`,
            );
          }),
      );

      await Promise.allSettled(sendPromises);
      this.logger.log(
        `Sent notification to ${connectionIds.length} connection(s) for user ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send realtime notification: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  async getNotifications(
    userId: string,
    page = 1,
    limit = 10,
  ): Promise<NotificationListResponseDto> {
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        include: {
          actor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImage: true,
            },
          },
          post: {
            include: {
              media: {
                where: { isTemp: false },
                take: 1,
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({
        where: { userId, isRead: false },
      }),
    ]);

    const mappedNotifications = await Promise.all(
      notifications.map(async (notification) => {
        let media: PostMediaResponseDto | null = null;

        if (
          notification.type === NotificationType.POST_CHEERED &&
          notification.post?.media?.length
        ) {
          const item = notification.post.media[0];

          media = new PostMediaResponseDto();
          media.id = item.id;
          media.type = item.type;
          media.mimeType = item.mimeType;
          media.size = item.size;
          media.url = await this.s3Service.getSignedUrl(item.url);
          media.thumbnailUrl = item.thumbnailUrl
            ? await this.s3Service.getSignedUrl(item.thumbnailUrl)
            : null;
        }

        return {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          postId: notification.postId,
          media,
          isRead: notification.isRead,
          createdAt: notification.createdAt,
          actor: notification.actor
            ? {
                id: notification.actor.id,
                fullName:
                  `${notification.actor.firstName} ${notification.actor.lastName}`.trim(),
                profileImage: notification.actor.profileImage
                  ? await this.s3Service.getSignedUrl(
                      notification.actor.profileImage,
                    )
                  : null,
              }
            : null,
        };
      }),
    );

    return {
      notifications: mappedNotifications,
      meta: calculatePaginationMeta(total, page, limit),
      totalUnreadCount: unreadCount,
    };
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  async registerDeviceToken(
    userId: string,
    token: string,
    timezone?: string,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.deviceToken.upsert({
        where: { token },
        create: {
          userId,
          token,
        },
        update: {
          userId,
        },
      }),

      ...(timezone
        ? [
            this.prisma.user.updateMany({
              where: {
                id: userId,
                timezone: {
                  not: timezone,
                },
              },
              data: {
                timezone,
              },
            }),
          ]
        : []),
    ]);
  }

  async unregisterDeviceToken(userId: string, token: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({
      where: {
        userId,
        token,
      },
    });
  }

  private async sendPushNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    const messaging = this.firebaseService.getMessaging();
    if (!messaging) {
      this.logger.warn(
        'Firebase Messaging not initialized, skipping push notification',
      );
      return;
    }

    try {
      const tokensRecord = await this.prisma.deviceToken.findMany({
        where: { userId },
        select: { token: true },
      });

      if (tokensRecord.length === 0) {
        return;
      }

      const tokens = tokensRecord.map((t) => t.token);

      const response = await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title,
          body,
        },
        data: data ?? {},
      });

      const tokensToRemove: string[] = [];
      response.responses.forEach((res, index) => {
        if (!res.success && res.error) {
          const code = res.error.code;
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            tokensToRemove.push(tokens[index]);
          }
          this.logger.debug(
            `FCM send failure for token ${tokens[index]}: ${res.error.message} (code: ${code})`,
          );
        }
      });

      if (tokensToRemove.length > 0) {
        await this.prisma.deviceToken.deleteMany({
          where: {
            token: { in: tokensToRemove },
          },
        });
        this.logger.log(
          `Removed ${tokensToRemove.length} inactive FCM token(s) for user ${userId}`,
        );
      }

      this.logger.log(
        `FCM push summary for user ${userId}: ${response.successCount} success(es), ${response.failureCount} failure(s)`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send FCM push notifications to user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
