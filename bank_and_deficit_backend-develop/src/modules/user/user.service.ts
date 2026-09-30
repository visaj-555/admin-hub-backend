import { Injectable, Logger } from '@nestjs/common';
import {
  PublicUserProfileResponseDto,
  UpdateProfileResponseDto,
} from './dto/user.response.dto';
import { PrismaService } from 'src/common/database/prisma.service';
import { UpdateProfileDto } from './dto/user.payload.dto';
import {
  calculatePaginationMeta,
  computeStreaksFromActivityDates,
  getPaginationParams,
  NotFoundException,
  PaginationDto,
  resolveCurrentStreak,
} from 'src/common/common.exports';
import { S3Service } from 'src/common/aws/s3.service';
import { Prisma } from 'generated/prisma/client';
import { NotificationType } from 'generated/prisma/enums';
import { NotificationService } from '../notification/notification.service';
import { SearchUsersDto } from './dto/search.payload.dto';
import { SearchUsersResponseDto } from './dto/search.response.dto';
import {
  DailyProgressDto,
  InsightsResponseDto,
} from './dto/insights.response.dto';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly notificationService: NotificationService,
  ) {}

  // ============== VIEW PROFILE (ME) ===========//

  async getProfile(userId: string): Promise<PublicUserProfileResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        profileImage: true,
        bio: true,
        isPrivate: true,
        currentStreak: true,
        highestStreak: true,
        lastStreakDate: true,
        createdAt: true,
        auth: {
          select: {
            email: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND', 'user.errors.notFound');
    }

    const [
      totalSavingsResult,
      totalCheers,
      totalPosts,
      followersCount,
      followingCount,
      currentStreak,
    ] = await Promise.all([
      this.prisma.dailyLog.aggregate({
        where: { userId: user.id },
        _sum: { bankCount: true },
      }),
      this.prisma.postCheer.count({
        where: { post: { userId: user.id } },
      }),
      this.prisma.post.count({
        where: { userId: user.id, status: 'PUBLISHED', deletedAt: null },
      }),
      this.prisma.follow.count({
        where: { followingId: user.id, status: 'ACCEPTED' },
      }),
      this.prisma.follow.count({
        where: { followerId: user.id, status: 'ACCEPTED' },
      }),
      this.resolveAndPersistCurrentStreak(
        user.id,
        user.currentStreak,
        user.lastStreakDate,
      ),
    ]);

    const profileImage = user.profileImage
      ? await this.s3Service.getSignedUrl(user.profileImage)
      : null;

    // -------- UNREAD COUNT -------- //
    let unreadCount: {
      notification: number;
      conversations: number;
    } | null = null;

    const [notificationUnreadCount, unreadConversationsCount] =
      await Promise.all([
        this.getNotificationUnreadCount(userId),
        this.getUnreadConversationsCount(userId),
      ]);

    unreadCount = {
      notification: notificationUnreadCount,
      conversations: unreadConversationsCount,
    };
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.auth.email,
      profileImage,
      bio: user.bio,
      isPrivate: user.isPrivate,
      currentStreak,
      highestStreak: user.highestStreak,
      totalSavings: totalSavingsResult._sum.bankCount || 0,
      totalCheers,
      totalPosts,
      followersCount,
      followingCount,
      followStatus: 'FOLLOWING',
      mutualFriendsCount: 0,
      mutualFriends: [],
      isMe: true,
      createdAt: user.createdAt,
      ...(unreadCount ? { unreadCount } : {}),
    };
  }

  private async getNotificationUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  private async getUnreadConversationsCount(userId: string): Promise<number> {
    const members = await this.prisma.conversationMember.findMany({
      where: { userId },
      select: {
        conversationId: true,
        lastReadAt: true,
      },
    });

    if (!members.length) {
      return 0;
    }

    const unreadCounts = await Promise.all<number>(
      members.map(async (member) => {
        const unreadMessages = await this.prisma.message.count({
          where: {
            conversationId: member.conversationId,
            senderId: { not: userId },
            createdAt: { gt: member.lastReadAt ?? new Date(0) },
          },
        });

        return unreadMessages;
      }),
    );

    return unreadCounts.reduce((total, count) => total + count, 0);
  }

  // ============== UPDATE PROFILE ===========//

  async updateProfile(
    authId: string,
    dto: UpdateProfileDto,
    file?: Express.Multer.File,
  ): Promise<UpdateProfileResponseDto> {
    // ------------ FIND EXISTING USER ------------ //
    const user = await this.prisma.user.findUnique({
      where: { authId },
      select: {
        id: true,
        profileImage: true,
      },
    });

    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND', 'user.errors.notFound');
    }

    // ------------ HANDLE PROFILE IMAGE ------------ //
    let profileImage = user.profileImage;
    let shouldUpdateProfileImage = false;

    if (file) {
      // ------------ DELETE OLD IMAGE FROM S3 ------------ //
      if (user.profileImage) {
        await this.s3Service
          .deleteFileByUri(user.profileImage)
          .catch((err: Error) => {
            this.logger.warn(
              `Failed to delete old profile image: ${err.message}`,
            );
          });
      }

      // ------------ UPLOAD NEW IMAGE TO S3 ------------ //
      const { fileUrl } = await this.s3Service.uploadImageFile(
        file,
        `profiles/${authId}`,
      );

      profileImage = fileUrl;
      shouldUpdateProfileImage = true;
    } else if (dto.removeProfileImage === true) {
      // ------------ DELETE OLD IMAGE FROM S3 AND SET TO NULL ------------ //
      if (user.profileImage) {
        await this.s3Service
          .deleteFileByUri(user.profileImage)
          .catch((err: Error) => {
            this.logger.warn(`Failed to delete profile image: ${err.message}`);
          });
      }
      profileImage = null;
      shouldUpdateProfileImage = true;
    }

    // ------------ UPDATE USER + AUTH EMAIL ------------ //
    const updated = await this.prisma.user.update({
      where: { authId },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.bio !== undefined && { bio: dto.bio }),

        ...(shouldUpdateProfileImage && { profileImage }),

        ...(dto.email !== undefined && {
          auth: {
            update: {
              email: dto.email.toLowerCase(),
            },
          },
        }),
      },
      select: {
        id: true,
        authId: true,
        firstName: true,
        lastName: true,
        profileImage: true,
        bio: true,
        countryId: true,
        createdAt: true,
        updatedAt: true,

        auth: {
          select: {
            email: true,
          },
        },
      },
    });

    // ------------ RESOLVE SIGNED URL ------------ //
    const signedProfileImage = updated.profileImage
      ? await this.s3Service.getSignedUrl(updated.profileImage)
      : null;

    const { auth, ...rest } = updated;

    return {
      ...rest,
      email: auth.email,
      profileImage: signedProfileImage,
    };
  }

  // ============== SEARCH USERS ===========//
  async searchUsers(
    authId: string,
    dto: SearchUsersDto,
  ): Promise<SearchUsersResponseDto> {
    // ------------ CURRENT USER ------------ //
    const currentUser = await this.prisma.user.findUnique({
      where: { authId },
      select: { id: true },
    });

    if (!currentUser) {
      throw new NotFoundException('USER_NOT_FOUND', 'user.errors.notFound');
    }

    // ------------ PAGINATION ------------ //
    const { page, limit, skip } = getPaginationParams(dto);

    const searchTerm = dto.search?.trim();

    // =====================================================
    // SEARCH MODE
    // =====================================================

    if (searchTerm) {
      const searchWords = searchTerm.split(/\s+/).filter(Boolean);

      const where: Prisma.UserWhereInput = {
        id: {
          not: currentUser.id,
        },

        auth: {
          isEmailVerified: true,
          isActive: true,
        },

        AND: searchWords.map((word) => ({
          OR: [
            {
              firstName: {
                contains: word,
                mode: 'insensitive',
              },
            },
            {
              lastName: {
                contains: word,
                mode: 'insensitive',
              },
            },
          ],
        })),
      };

      const [users, total] = await Promise.all([
        this.prisma.user.findMany({
          where,

          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
            isPrivate: true,

            _count: {
              select: {
                posts: {
                  where: {
                    status: 'PUBLISHED',
                    deletedAt: null,
                  },
                },
              },
            },
          },

          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],

          skip,
          take: limit,
        }),

        this.prisma.user.count({
          where,
        }),
      ]);

      const userIds = users.map((u) => u.id);

      const followRelations = await this.prisma.follow.findMany({
        where: {
          followerId: currentUser.id,

          followingId: {
            in: userIds,
          },
        },

        select: {
          followingId: true,
          status: true,
        },
      });

      const followMap = new Map(
        followRelations.map((r) => [r.followingId, r.status]),
      );

      const enrichedUsers = await Promise.all(
        users.map(async (u) => {
          const relationStatus = followMap.get(u.id);

          let followStatus: 'FOLLOWING' | 'REQUESTED' | 'NOT_FOLLOWING' =
            'NOT_FOLLOWING';

          if (relationStatus === 'ACCEPTED') {
            followStatus = 'FOLLOWING';
          }

          if (relationStatus === 'PENDING') {
            followStatus = 'REQUESTED';
          }

          return {
            id: u.id,

            fullName: `${u.firstName} ${u.lastName}`.trim(),

            profileImage: u.profileImage
              ? await this.s3Service.getSignedUrl(u.profileImage)
              : null,

            followStatus,

            isPrivate: u.isPrivate,

            totalGoodnessCount: u._count.posts,
          };
        }),
      );

      return {
        users: enrichedUsers,
        meta: calculatePaginationMeta(total, page, limit),
      };
    }

    // =====================================================
    // DISCOVERY MODE (NO SEARCH)
    // =====================================================

    const allUsers = await this.prisma.user.findMany({
      where: {
        id: {
          not: currentUser.id,
        },
        auth: {
          isEmailVerified: true,
          isActive: true,
        },
      },

      select: {
        id: true,
        firstName: true,
        lastName: true,
        profileImage: true,
        isPrivate: true,

        _count: {
          select: {
            posts: {
              where: {
                status: 'PUBLISHED',
                deletedAt: null,
              },
            },
          },
        },
      },

      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    const userIds = allUsers.map((u) => u.id);

    const followRelations = await this.prisma.follow.findMany({
      where: {
        followerId: currentUser.id,

        followingId: {
          in: userIds,
        },
      },

      select: {
        followingId: true,
        status: true,
      },
    });

    const followMap = new Map(
      followRelations.map((r) => [r.followingId, r.status]),
    );

    const enrichedUsers = await Promise.all(
      allUsers.map(async (u) => {
        const relationStatus = followMap.get(u.id);

        let followStatus: 'FOLLOWING' | 'REQUESTED' | 'NOT_FOLLOWING' =
          'NOT_FOLLOWING';

        if (relationStatus === 'ACCEPTED') {
          followStatus = 'FOLLOWING';
        }

        if (relationStatus === 'PENDING') {
          followStatus = 'REQUESTED';
        }

        return {
          id: u.id,

          fullName: `${u.firstName} ${u.lastName}`.trim(),

          profileImage: u.profileImage
            ? await this.s3Service.getSignedUrl(u.profileImage)
            : null,

          followStatus,

          isPrivate: u.isPrivate,

          totalGoodnessCount: u._count.posts,
        };
      }),
    );

    // ------------ SORT BY RELATIONSHIP ------------ //
    const priority = {
      NOT_FOLLOWING: 0,
      REQUESTED: 1,
      FOLLOWING: 2,
    };

    enrichedUsers.sort((a, b) => {
      const relationOrder = priority[a.followStatus] - priority[b.followStatus];

      if (relationOrder !== 0) {
        return relationOrder;
      }

      return a.fullName.localeCompare(b.fullName);
    });

    // ------------ PAGINATE AFTER SORT ------------ //
    const paginatedUsers = enrichedUsers.slice(skip, skip + limit);

    return {
      users: paginatedUsers,

      meta: calculatePaginationMeta(enrichedUsers.length, page, limit),
    };
  }

  // ============== GET INSIGHTS ===========//
  async getInsights(
    authId: string,
    week: 'current' | 'past' = 'current',
  ): Promise<InsightsResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { authId },
      select: {
        id: true,
        currentStreak: true,
        highestStreak: true,
        lastStreakDate: true,
      },
    });

    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND', 'user.errors.notFound');
    }

    const { currentStreak, highestStreak } =
      await this.resolveAndPersistInsightStreaks(
        user.id,
        user.currentStreak,
        user.highestStreak,
      );

    // ------------ TODAY'S GOODNESS ------------ //
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todaysGoodness = await this.prisma.post.count({
      where: {
        userId: user.id,
        status: 'PUBLISHED',
        deletedAt: null,
        activityDate: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    });

    // ------------ RANDOM QUOTE ------------ //
    const quoteCount = await this.prisma.quote.count();
    let randomQuote = 'Consistency is the key to progress.';

    if (quoteCount > 0) {
      const randomSkip = Math.floor(Math.random() * quoteCount);
      const quoteRecord = await this.prisma.quote.findFirst({
        skip: randomSkip,
        select: { content: true },
      });
      if (quoteRecord?.content) randomQuote = quoteRecord.content;
    }

    // ------------ WEEKLY PROGRESS ------------ //
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // current = this Monday → today
    // past    = last Monday → last Sunday
    let weekStart: Date;
    let weekEnd: Date;

    const dayOfWeek = today.getDay(); // 0 Sun … 6 Sat
    const daysSinceMonday = (dayOfWeek + 6) % 7; // Mon = 0

    if (week === 'current') {
      weekStart = new Date(today);
      weekStart.setDate(today.getDate() - daysSinceMonday);

      weekEnd = new Date(today); // up to today
    } else {
      // past week: last Monday → last Sunday
      weekEnd = new Date(today);
      weekEnd.setDate(today.getDate() - daysSinceMonday - 1); // last Sunday

      weekStart = new Date(weekEnd);
      weekStart.setDate(weekEnd.getDate() - 6); // last Monday
    }

    const weeklyProgress: DailyProgressDto[] = [];
    const totalDays =
      Math.round(
        (weekEnd.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;

    for (let i = 0; i < totalDays; i++) {
      const currentDay = new Date(weekStart);
      currentDay.setDate(weekStart.getDate() + i);

      const startOfDay = new Date(currentDay);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(currentDay);
      endOfDay.setHours(23, 59, 59, 999);

      const tasks = await this.prisma.post.count({
        where: {
          userId: user.id,
          status: 'PUBLISHED',
          deletedAt: null,
          activityDate: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      });

      weeklyProgress.push({
        date: currentDay.toISOString().split('T')[0],
        day: currentDay.toLocaleString('en-US', { weekday: 'long' }),
        tasks,
      });
    }

    return {
      currentStreak,
      highestStreak,
      todaysGoodness,
      quote: randomQuote,
      weeklyProgress,
    };
  }

  // ============== VIEW USER PROFILE ===========//
  async getUserProfile(
    currentUserId: string,
    targetUserId: string,
  ): Promise<PublicUserProfileResponseDto> {
    // ------------ FIND TARGET USER ------------ //
    const user = await this.prisma.user.findUnique({
      where: {
        id: targetUserId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        profileImage: true,
        isPrivate: true,
        bio: true,
        currentStreak: true,
        highestStreak: true,
        lastStreakDate: true,
        createdAt: true,
        auth: {
          select: {
            email: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND', 'user.errors.notFound');
    }

    // ------------ PARALLEL STATS ------------ //
    const [
      totalSavingsResult,
      totalCheers,
      totalPosts,
      followersCount,
      followingCount,
      followRelation,
      mutualFriends,
      currentStreak,
    ] = await Promise.all([
      // ------------ TOTAL SAVINGS ------------ //
      this.prisma.dailyLog.aggregate({
        where: {
          userId: user.id,
        },

        _sum: {
          bankCount: true,
        },
      }),

      // ------------ TOTAL CHEERS RECEIVED ------------ //
      this.prisma.postCheer.count({
        where: {
          post: {
            userId: user.id,
          },
        },
      }),

      // ------------ TOTAL POSTS ------------ //
      this.prisma.post.count({
        where: {
          userId: user.id,
          status: 'PUBLISHED',
          deletedAt: null,
        },
      }),

      // ------------ FOLLOWERS COUNT ------------ //
      this.prisma.follow.count({
        where: {
          followingId: user.id,
          status: 'ACCEPTED',
        },
      }),

      // ------------ FOLLOWING COUNT ------------ //
      this.prisma.follow.count({
        where: {
          followerId: user.id,
          status: 'ACCEPTED',
        },
      }),

      // ------------ FOLLOW STATUS ------------ //
      this.prisma.follow.findFirst({
        where: {
          followerId: currentUserId,
          followingId: user.id,
        },

        select: {
          status: true,
        },
      }),

      currentUserId === user.id
        ? Promise.resolve({ count: 0, preview: [] })
        : this.getMutualFriendsSummary(currentUserId, user.id),

      this.resolveAndPersistCurrentStreak(
        user.id,
        user.currentStreak,
        user.lastStreakDate,
      ),
    ]);

    // ------------ FOLLOW STATUS ------------ //
    let followStatus: 'FOLLOWING' | 'REQUESTED' | 'NOT_FOLLOWING' =
      'NOT_FOLLOWING';

    if (followRelation?.status === 'ACCEPTED') {
      followStatus = 'FOLLOWING';
    }

    if (followRelation?.status === 'PENDING') {
      if (user.isPrivate) {
        followStatus = 'REQUESTED';
      } else {
        await this.prisma.follow.updateMany({
          where: {
            followerId: currentUserId,
            followingId: user.id,
            status: 'PENDING',
          },
          data: { status: 'ACCEPTED' },
        });
        await this.prisma.notification.deleteMany({
          where: {
            userId: user.id,
            actorId: currentUserId,
            type: 'FOLLOW_REQUEST_RECEIVED',
          },
        });
        await this.notificationService.createAndSend({
          userId: currentUserId,
          actorId: user.id,
          type: NotificationType.FOLLOW_REQUEST_ACCEPTED,
          title: 'Follow Request Accepted',
          message: `${user.firstName} ${user.lastName} accepted your follow request`,
        });
        followStatus = 'FOLLOWING';
      }
    }

    // ------------ PROFILE IMAGE ------------ //
    const profileImage = user.profileImage
      ? await this.s3Service.getSignedUrl(user.profileImage)
      : null;

    // ------------ RETURN ------------ //
    return {
      id: user.id,

      firstName: user.firstName,

      lastName: user.lastName,

      email: user.auth.email,

      profileImage,

      bio: user.bio,

      currentStreak,

      highestStreak: user.highestStreak,

      totalSavings: totalSavingsResult._sum.bankCount || 0,

      totalCheers,

      totalPosts,

      followersCount,

      followingCount,

      followStatus,
      isPrivate: user.isPrivate,

      isMe: currentUserId === user.id,

      createdAt: user.createdAt,

      mutualFriendsCount: mutualFriends.count,

      mutualFriends: mutualFriends.preview,
    };
  }

  // ============== RECOMMENDATIONS (FOLLOWING FIRST, THEN PUBLIC) ===========//
  async getRecommendations(
    authId: string,
    dto: PaginationDto,
  ): Promise<SearchUsersResponseDto> {
    // ------------ CURRENT USER ------------ //
    const currentUser = await this.prisma.user.findUnique({
      where: { authId },
      select: { id: true },
    });

    if (!currentUser) {
      throw new NotFoundException('USER_NOT_FOUND', 'user.errors.notFound');
    }

    const { page, limit, skip } = getPaginationParams(dto);

    // ------------ GROUP A: PEOPLE I ALREADY FOLLOW (ACCEPTED) ------------ //
    const myFollowing = await this.prisma.follow.findMany({
      where: {
        followerId: currentUser.id,
        status: 'ACCEPTED',
      },
      select: {
        createdAt: true,
        following: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
            isPrivate: true,
            _count: {
              select: {
                posts: { where: { status: 'PUBLISHED', deletedAt: null } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const groupAIds = myFollowing.map((f) => f.following.id);

    // ------------ GROUP B: PUBLIC ACCOUNTS I DON'T ALREADY FOLLOW ------------ //
    const groupBUsers = await this.prisma.user.findMany({
      where: {
        id: { notIn: [currentUser.id, ...groupAIds] },
        isPrivate: false,
        auth: { isEmailVerified: true, isActive: true },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        profileImage: true,
        isPrivate: true,
        _count: {
          select: {
            posts: { where: { status: 'PUBLISHED', deletedAt: null } },
          },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    // ------------ NORMALIZE + COMBINE (GROUP A FIRST) ------------ //
    type RawUser = {
      id: string;
      firstName: string;
      lastName: string;
      profileImage: string | null;
      isPrivate: boolean;
      _count: { posts: number };
    };

    const mapUser = (
      u: RawUser,
      followStatus: 'FOLLOWING' | 'NOT_FOLLOWING',
    ) => ({
      id: u.id,
      fullName: `${u.firstName} ${u.lastName}`.trim(),
      profileImageRaw: u.profileImage,
      isPrivate: u.isPrivate,
      followStatus,
      totalGoodnessCount: u._count.posts,
    });

    const combined = [
      ...myFollowing.map((f) => mapUser(f.following, 'FOLLOWING' as const)),
      ...groupBUsers.map((u) => mapUser(u, 'NOT_FOLLOWING' as const)),
    ];

    const total = combined.length;
    const paginatedUsers = combined.slice(skip, skip + limit);

    // ------------ ENRICH: SIGNED URLS ------------ //
    const enrichedUsers = await Promise.all(
      paginatedUsers.map(async (u) => ({
        id: u.id,
        fullName: u.fullName,
        profileImage: u.profileImageRaw
          ? await this.s3Service.getSignedUrl(u.profileImageRaw)
          : null,
        followStatus: u.followStatus,
        isPrivate: u.isPrivate,
        totalGoodnessCount: u.totalGoodnessCount,
      })),
    );

    return {
      users: enrichedUsers,
      meta: calculatePaginationMeta(total, page, limit),
    };
  }

  /**
   * Streak is only incremented on post activity. When a user misses 2+ days,
   * expire the stored currentStreak to 0 so Insights/profile stay accurate.
   */
  private async resolveAndPersistCurrentStreak(
    userId: string,
    currentStreak: number,
    lastStreakDate: Date | null,
  ): Promise<number> {
    const effectiveStreak = resolveCurrentStreak(currentStreak, lastStreakDate);

    if (effectiveStreak !== currentStreak) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { currentStreak: effectiveStreak },
      });
    }

    return effectiveStreak;
  }

  /**
   * Recompute current + highest streaks from published activity days so Insights
   * always reflects the max consecutive-day streak achieved.
   */
  private async resolveAndPersistInsightStreaks(
    userId: string,
    storedCurrentStreak: number,
    storedHighestStreak: number,
  ): Promise<{ currentStreak: number; highestStreak: number }> {
    const posts = await this.prisma.post.findMany({
      where: {
        userId,
        status: 'PUBLISHED',
        deletedAt: null,
      },
      select: {
        activityDate: true,
      },
    });

    const computed = computeStreaksFromActivityDates(
      posts.map((post) => post.activityDate),
    );

    // Never lower a previously stored career-high (e.g. after older posts deleted).
    const highestStreak = Math.max(
      storedHighestStreak,
      computed.highestStreak,
      computed.currentStreak,
    );
    const currentStreak = computed.currentStreak;

    if (
      currentStreak !== storedCurrentStreak ||
      highestStreak !== storedHighestStreak
    ) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          currentStreak,
          highestStreak,
          ...(computed.lastStreakDate
            ? { lastStreakDate: computed.lastStreakDate }
            : {}),
        },
      });
    }

    return { currentStreak, highestStreak };
  }

  private async getMutualFriendsSummary(
    currentUserId: string,
    targetUserId: string,
  ): Promise<{
    count: number;
    preview: { id: string; profileImage: string | null }[];
  }> {
    const where = {
      followerId: currentUserId,
      status: 'ACCEPTED' as const,
      following: {
        followers: {
          some: {
            followerId: targetUserId,
            status: 'ACCEPTED' as const,
          },
        },
      },
    };

    const [count, mutualFollows] = await Promise.all([
      this.prisma.follow.count({ where }),
      this.prisma.follow.findMany({
        where,
        take: 3,
        include: {
          following: {
            select: {
              id: true,
              profileImage: true,
            },
          },
        },
      }),
    ]);

    const preview = await Promise.all(
      mutualFollows.map(async (follow) => ({
        id: follow.following.id,
        profileImage: follow.following.profileImage
          ? await this.s3Service.getSignedUrl(follow.following.profileImage)
          : null,
      })),
    );

    return { count, preview };
  }
}
