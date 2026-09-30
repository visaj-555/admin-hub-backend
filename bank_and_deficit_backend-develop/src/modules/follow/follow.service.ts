import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/common/database/prisma.service';
import {
  BadRequestException,
  calculatePaginationMeta,
  ForbiddenException,
  getPaginationParams,
  NotFoundException,
  PaginationMeta,
} from 'src/common/common.exports';
import { S3Service } from 'src/common/aws/s3.service';
import {
  FollowListDto,
  FollowResponseDto,
  UserFollowListDto,
} from './dto/follow.response.dto';
import { UpdateFollowStatusDto } from './dto/payloads/follow.payload.dto';
import { Prisma } from 'generated/prisma/client';
import { ToggleFollowResult } from './follow.interface';
import { FollowStatus, NotificationType } from 'generated/prisma/enums';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class FollowService {
  private readonly logger = new Logger(FollowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly notificationService: NotificationService,
  ) {}

  // ============== SEND FOLLOW REQUEST ===========//
  async toggleFollow(
    userId: string,
    followingId: string,
  ): Promise<ToggleFollowResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true },
    });

    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND', 'user.errors.notFound');
    }

    if (user.id === followingId) {
      throw new BadRequestException(
        'CANNOT_FOLLOW_SELF',
        'follow.errors.selfFollow',
      );
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: followingId },
      select: { id: true, firstName: true, lastName: true, isPrivate: true },
    });

    if (!targetUser) {
      throw new NotFoundException(
        'TARGET_USER_NOT_FOUND',
        'user.errors.notFound',
      );
    }

    // ------------ CHECK EXISTING FOLLOW ------------ //
    const existingFollow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId,
        },
      },
    });

    // ------------ UNFOLLOW / CANCEL REQUEST ------------ //
    if (existingFollow) {
      await this.prisma.follow.delete({
        where: {
          followerId_followingId: {
            followerId: userId,
            followingId,
          },
        },
      });

      // Stale REJECTED rows are cleared so a fresh request can be created below
      if (existingFollow.status !== 'REJECTED') {
        // Clean up related notifications
        await this.notificationService.deleteNotifications({
          userId: followingId,
          actorId: userId,
          type: {
            in: [
              NotificationType.FOLLOW_REQUEST_RECEIVED,
              NotificationType.STARTED_FOLLOWING,
            ],
          },
        });

        return {
          action:
            existingFollow.status === 'PENDING'
              ? 'REQUEST_CANCELLED'
              : 'UNFOLLOWED',
          isPrivate: targetUser.isPrivate,
          follow: {
            ...existingFollow,
            status: (existingFollow.status === 'PENDING'
              ? 'REQUEST_CANCELLED'
              : 'UNFOLLOWED') as unknown as FollowStatus,
          },
        };
      }
    }

    // ------------ FOLLOW / SEND REQUEST ------------ //
    const followStatus = targetUser.isPrivate ? 'PENDING' : 'ACCEPTED';

    const follow = await this.prisma.follow.create({
      data: {
        followerId: userId,
        followingId,
        status: followStatus,
      },
    });

    // ------------ NOTIFICATIONS ------------ //
    const notificationType = targetUser.isPrivate
      ? NotificationType.FOLLOW_REQUEST_RECEIVED
      : NotificationType.STARTED_FOLLOWING;

    const notificationPayload = targetUser.isPrivate
      ? {
          title: 'Follow Request',
          message: `${user.firstName} ${user.lastName} sent you a follow request`,
        }
      : {
          title: 'New Follower',
          message: `${user.firstName} ${user.lastName} started following you`,
        };

    this.notificationService
      .upsertAndSend({
        userId: followingId,
        actorId: userId,
        type: notificationType,
        ...notificationPayload,
        upsertKey: {
          userId: followingId,
          actorId: userId,
          type: notificationType,
        },
      })
      .catch((error) => {
        this.logger.error(
          `Failed to send follow notification: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });

    return {
      action: targetUser.isPrivate ? 'REQUEST_SENT' : 'FOLLOWED',
      isPrivate: targetUser.isPrivate,
      follow,
    };
  }

  // ============== ACCEPT / REJECT FOLLOW REQUEST ===========//
  async updateFollowStatus(
    userId: string,
    dto: UpdateFollowStatusDto,
  ): Promise<FollowResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND', 'user.errors.notFound');
    }

    const existingFollow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: dto.followerId,
          followingId: user.id,
        },
      },
    });

    if (!existingFollow) {
      throw new NotFoundException(
        'FOLLOW_REQUEST_NOT_FOUND',
        'follow.errors.notFound',
      );
    }

    // Remove the original "follow request received" notification —
    // it's no longer pending, regardless of ACCEPTED or REJECTED
    await this.notificationService.deleteNotifications({
      userId: user.id,
      actorId: dto.followerId,
      type: NotificationType.FOLLOW_REQUEST_RECEIVED,
    });

    // Reject clears the relationship so the sender can send a fresh request later
    // without leaving a REJECTED row that would block / confuse toggleFollow
    if (dto.status === 'REJECTED') {
      await this.prisma.follow.delete({
        where: {
          followerId_followingId: {
            followerId: dto.followerId,
            followingId: user.id,
          },
        },
      });

      return {
        ...existingFollow,
        status: 'REJECTED',
      };
    }

    const follow = await this.prisma.follow.update({
      where: {
        followerId_followingId: {
          followerId: dto.followerId,
          followingId: user.id,
        },
      },
      data: {
        status: dto.status,
      },
    });

    // Notify only if accepted
    if (dto.status === 'ACCEPTED') {
      this.notificationService
        .createAndSend({
          userId: dto.followerId,
          actorId: user.id,
          type: NotificationType.FOLLOW_REQUEST_ACCEPTED,
          title: 'Follow Request Accepted',
          message: `${user.firstName} ${user.lastName} accepted your follow request`,
        })
        .catch((error) => {
          this.logger.error(
            `Failed to send follow accepted notification: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    }

    return follow;
  }

  // ============== GET FOLLOWERS ===========//
  async getFollowers(
    currentUserId: string,
    targetUserId: string,
    paginationDto: FollowListDto,
  ): Promise<{
    items: UserFollowListDto[];
    meta: PaginationMeta;
  }> {
    // ------------ PAGINATION ------------ //
    const { page, limit, skip } = getPaginationParams(paginationDto);

    const searchTerm = paginationDto.search?.trim();

    // ------------ TARGET USER ------------ //
    const targetUser = await this.prisma.user.findUnique({
      where: {
        id: targetUserId,
      },
      select: {
        id: true,
        isPrivate: true,
      },
    });

    if (!targetUser) {
      throw new NotFoundException('USER_NOT_FOUND', 'user.errors.notFound');
    }

    // ------------ ACCESS CHECK ------------ //
    let canViewFollowers = false;

    // Own profile
    if (currentUserId === targetUser.id) {
      canViewFollowers = true;
    }

    // Public profile
    else if (!targetUser.isPrivate) {
      canViewFollowers = true;
    }

    // Private profile → must follow them
    else {
      const isFollowing = await this.prisma.follow.findFirst({
        where: {
          followerId: currentUserId,
          followingId: targetUser.id,
          status: 'ACCEPTED',
        },
        select: {
          id: true,
        },
      });

      canViewFollowers = !!isFollowing;
    }

    // ------------ FORBIDDEN ------------ //
    if (!canViewFollowers) {
      throw new ForbiddenException(
        'FOLLOWERS_NOT_VISIBLE',
        'follow.errors.followersNotVisible',
      );
    }

    // ------------ SEARCH FILTER ------------ //
    const where: Prisma.FollowWhereInput = {
      followingId: targetUser.id,
      status: 'ACCEPTED',
    };

    if (searchTerm) {
      where.follower = {
        OR: [
          {
            firstName: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
          {
            lastName: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
        ],
      };
    }

    // ------------ FETCH FOLLOWERS + COUNT ------------ //
    const [followers, total] = await Promise.all([
      this.prisma.follow.findMany({
        where,

        skip,
        take: limit,

        include: {
          follower: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImage: true,
              currentStreak: true,
            },
          },
        },
      }),

      this.prisma.follow.count({
        where,
      }),
    ]);

    const followerIds = followers.map((f) => f.follower.id);

    // ------------ CURRENT USER RELATIONS ------------ //
    const [myFollowRelations, savings] = await Promise.all([
      this.prisma.follow.findMany({
        where: {
          followerId: currentUserId,

          followingId: {
            in: followerIds,
          },
        },

        select: {
          followingId: true,
          status: true,
        },
      }),

      this.prisma.dailyLog.groupBy({
        by: ['userId'],

        where: {
          userId: {
            in: followerIds,
          },
        },

        _sum: {
          bankCount: true,
        },
      }),
    ]);

    // ------------ RELATION MAP ------------ //
    const relationMap = new Map(
      myFollowRelations.map((r) => [r.followingId, r.status]),
    );

    // ------------ SAVINGS MAP ------------ //
    const savingsMap = new Map(
      savings.map((s) => [s.userId, s._sum.bankCount || 0]),
    );

    // ------------ RESPONSE ------------ //
    const data = await Promise.all(
      followers.map(async (f) => {
        const relationStatus = relationMap.get(f.follower.id);

        let followStatus: 'FOLLOWING' | 'REQUESTED' | 'NOT_FOLLOWING' =
          'NOT_FOLLOWING';

        if (relationStatus === 'ACCEPTED') {
          followStatus = 'FOLLOWING';
        }

        if (relationStatus === 'PENDING') {
          followStatus = 'REQUESTED';
        }

        return {
          id: f.follower.id,

          fullName: `${f.follower.firstName} ${f.follower.lastName}`.trim(),

          profileImage: f.follower.profileImage
            ? await this.s3Service.getSignedUrl(f.follower.profileImage)
            : null,

          currentStreak: f.follower.currentStreak,

          totalSavings: savingsMap.get(f.follower.id) ?? 0,

          followStatus,

          isMe: currentUserId === f.follower.id,
        };
      }),
    );

    // ------------ RETURN ------------ //
    return {
      items: data,

      meta: calculatePaginationMeta(total, page, limit),
    };
  }

  // ============== GET FOLLOWING ===========//
  async getFollowing(
    currentUserId: string,
    targetUserId: string,
    paginationDto: FollowListDto,
  ): Promise<{
    items: UserFollowListDto[];
    meta: PaginationMeta;
  }> {
    // ------------ PAGINATION ------------ //
    const { page, limit, skip } = getPaginationParams(paginationDto);

    const searchTerm = paginationDto.search?.trim();

    // ------------ TARGET USER ------------ //
    const targetUser = await this.prisma.user.findUnique({
      where: {
        id: targetUserId,
      },
      select: {
        id: true,
        isPrivate: true,
      },
    });

    if (!targetUser) {
      throw new NotFoundException('USER_NOT_FOUND', 'user.errors.notFound');
    }

    // ------------ ACCESS CHECK ------------ //
    let canViewFollowing = false;

    if (currentUserId === targetUser.id) {
      canViewFollowing = true;
    } else if (!targetUser.isPrivate) {
      canViewFollowing = true;
    } else {
      const isFollowing = await this.prisma.follow.findFirst({
        where: {
          followerId: currentUserId,
          followingId: targetUser.id,
          status: 'ACCEPTED',
        },
        select: {
          id: true,
        },
      });

      canViewFollowing = !!isFollowing;
    }

    // ------------ FORBIDDEN ------------ //
    if (!canViewFollowing) {
      throw new ForbiddenException(
        'FOLLOWING_NOT_VISIBLE',
        'follow.errors.followingNotVisible',
      );
    }

    // ------------ SEARCH FILTER ------------ //
    const where: Prisma.FollowWhereInput = {
      followerId: targetUser.id,
      status: 'ACCEPTED',
    };

    if (searchTerm) {
      where.following = {
        OR: [
          {
            firstName: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
          {
            lastName: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
        ],
      };
    }

    // ------------ FETCH FOLLOWING + COUNT ------------ //
    const [followingList, total] = await Promise.all([
      this.prisma.follow.findMany({
        where,

        skip,
        take: limit,

        include: {
          following: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImage: true,
              currentStreak: true,
            },
          },
        },
      }),

      this.prisma.follow.count({
        where,
      }),
    ]);

    const followingIds = followingList.map((f) => f.following.id);

    // ------------ CURRENT USER RELATIONS + SAVINGS ------------ //
    const [myFollowRelations, savings] = await Promise.all([
      this.prisma.follow.findMany({
        where: {
          followerId: currentUserId,

          followingId: {
            in: followingIds,
          },
        },

        select: {
          followingId: true,
          status: true,
        },
      }),

      this.prisma.dailyLog.groupBy({
        by: ['userId'],

        where: {
          userId: {
            in: followingIds,
          },
        },

        _sum: {
          bankCount: true,
        },
      }),
    ]);

    // ------------ RELATION MAP ------------ //
    const relationMap = new Map(
      myFollowRelations.map((r) => [r.followingId, r.status]),
    );

    // ------------ SAVINGS MAP ------------ //
    const savingsMap = new Map(
      savings.map((s) => [s.userId, s._sum.bankCount || 0]),
    );

    // ------------ RESPONSE ------------ //
    const data = await Promise.all(
      followingList.map(async (f) => {
        const relationStatus = relationMap.get(f.following.id);

        let followStatus: 'FOLLOWING' | 'REQUESTED' | 'NOT_FOLLOWING' =
          'NOT_FOLLOWING';

        if (relationStatus === 'ACCEPTED') {
          followStatus = 'FOLLOWING';
        }

        if (relationStatus === 'PENDING') {
          followStatus = 'REQUESTED';
        }

        return {
          id: f.following.id,

          fullName: `${f.following.firstName} ${f.following.lastName}`.trim(),

          profileImage: f.following.profileImage
            ? await this.s3Service.getSignedUrl(f.following.profileImage)
            : null,

          currentStreak: f.following.currentStreak,

          totalSavings: savingsMap.get(f.following.id) ?? 0,

          followStatus,

          isMe: currentUserId === f.following.id,
        };
      }),
    );

    // ------------ RETURN ------------ //
    return {
      items: data,

      meta: calculatePaginationMeta(total, page, limit),
    };
  }

  // ============== GET MUTUAL FRIENDS ===========//
  async getMutualFriends(
    currentUserId: string,
    targetUserId: string,
    paginationDto: FollowListDto,
  ): Promise<{
    items: UserFollowListDto[];
    meta: PaginationMeta;
  }> {
    const { page, limit, skip } = getPaginationParams(paginationDto);

    const searchTerm = paginationDto.search?.trim();

    const targetUser = await this.prisma.user.findUnique({
      where: {
        id: targetUserId,
      },
      select: {
        id: true,
      },
    });

    if (!targetUser) {
      throw new NotFoundException('USER_NOT_FOUND', 'user.errors.notFound');
    }

    const followingFilter: Prisma.UserWhereInput = {
      followers: {
        some: {
          followerId: targetUser.id,
          status: 'ACCEPTED',
        },
      },
    };

    if (searchTerm) {
      followingFilter.OR = [
        {
          firstName: {
            contains: searchTerm,
            mode: 'insensitive',
          },
        },
        {
          lastName: {
            contains: searchTerm,
            mode: 'insensitive',
          },
        },
      ];
    }

    const where: Prisma.FollowWhereInput = {
      followerId: currentUserId,
      status: 'ACCEPTED',
      following: followingFilter,
    };

    const [mutualFriends, total] = await Promise.all([
      this.prisma.follow.findMany({
        where,
        skip,
        take: limit,
        include: {
          following: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImage: true,
              currentStreak: true,
            },
          },
        },
      }),

      this.prisma.follow.count({
        where,
      }),
    ]);

    const mutualFriendIds = mutualFriends.map((f) => f.following.id);

    const [myFollowRelations, savings] = await Promise.all([
      this.prisma.follow.findMany({
        where: {
          followerId: currentUserId,
          followingId: {
            in: mutualFriendIds,
          },
        },
        select: {
          followingId: true,
          status: true,
        },
      }),

      this.prisma.dailyLog.groupBy({
        by: ['userId'],
        where: {
          userId: {
            in: mutualFriendIds,
          },
        },
        _sum: {
          bankCount: true,
        },
      }),
    ]);

    const relationMap = new Map(
      myFollowRelations.map((r) => [r.followingId, r.status]),
    );

    const savingsMap = new Map(
      savings.map((s) => [s.userId, s._sum.bankCount || 0]),
    );

    const data = await Promise.all(
      mutualFriends.map(async (f) => {
        const relationStatus = relationMap.get(f.following.id);

        let followStatus: 'FOLLOWING' | 'REQUESTED' | 'NOT_FOLLOWING' =
          'NOT_FOLLOWING';

        if (relationStatus === 'ACCEPTED') {
          followStatus = 'FOLLOWING';
        }

        if (relationStatus === 'PENDING') {
          followStatus = 'REQUESTED';
        }

        return {
          id: f.following.id,
          fullName: `${f.following.firstName} ${f.following.lastName}`.trim(),
          profileImage: f.following.profileImage
            ? await this.s3Service.getSignedUrl(f.following.profileImage)
            : null,
          currentStreak: f.following.currentStreak,
          totalSavings: savingsMap.get(f.following.id) ?? 0,
          followStatus,
          isMe: currentUserId === f.following.id,
        };
      }),
    );

    return {
      items: data,
      meta: calculatePaginationMeta(total, page, limit),
    };
  }
}
