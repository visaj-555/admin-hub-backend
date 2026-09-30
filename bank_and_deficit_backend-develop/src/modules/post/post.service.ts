import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';

import {
  CreatePostResponseDto,
  GeneratePresignedUrlDto,
  UpdatePostDto,
} from './dto/payloads/post.create.dto';
import { POST_CONFIG } from './post.config';
import {
  MediaProcessingStatus,
  MediaType,
  NotificationType,
  PostStatus,
  Visibility,
} from 'generated/prisma/enums';
import {
  ConfirmedPostResponseDto,
  GenerateTempPresignedUrlDto,
  PostMediaResponseDto,
  PresignedUrlResponseDto,
} from './dto/responses/post.create.response';
import { PrismaService } from 'src/common/database/prisma.service';
import { S3Service } from 'src/common/aws/s3.service';
import {
  BadRequestException,
  calculatePaginationMeta,
  getPaginationParams,
  NotFoundException,
  PaginationDto,
} from 'src/common/common.exports';
import { Prisma } from 'generated/prisma/client';
import { GetFeedDto } from './dto/payloads/post.feed.dto';
import { GetUserPostsDto } from './dto/payloads/post.user-posts.dto';
import {
  DailyLogResponseDto,
  FeedResponseDto,
  PostAuthorProfileDto,
} from './dto/responses/post.feed.response';
import {
  CompressionMessagePayload,
  SQSService,
} from 'src/common/aws/sqs.service';
import { createHash, randomUUID } from 'crypto';
import {
  ConfirmNewUploadDto,
  UpdateCompressedMediaDto,
} from './dto/payloads/post.media.dto';
import { NotificationService } from '../notification/notification.service';
import { StreakAchieveService } from 'src/common/cron/streak-achieve';

@Injectable()
export class PostService {
  private readonly logger = new Logger(PostService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly sqsService: SQSService,
    private readonly notificationService: NotificationService,
    private readonly streakAchieveService: StreakAchieveService,
  ) {}

  // ============== CREATE POST WITH TEMP MEDIA FILES ============== //
  async generateTempPresignedUrl(
    authId: string,
    dto: GenerateTempPresignedUrlDto,
  ): Promise<CreatePostResponseDto> {
    const post = await this.prisma.post.create({
      data: {
        userId: authId,
        status: PostStatus.DRAFT,
        activityDate: new Date(),
      },
    });

    const presigned = await this.generatePresignedUrl(authId, dto);

    const mediaId = randomUUID();

    const media = await this.prisma.postMedia.create({
      data: {
        id: mediaId,
        postId: post.id,
        type: dto.type,
        url: presigned.key,
        size: this.formatFileSize(dto.size),

        mimeType:
          dto.type === MediaType.VIDEO
            ? (POST_CONFIG.VIDEO.ALLOWED_TYPES[0] ?? 'video/mp4')
            : (POST_CONFIG.IMAGE.ALLOWED_TYPES[0] ?? 'image/jpeg'),

        isTemp: true,
        processingStatus: MediaProcessingStatus.PENDING,
      },
    });

    return {
      postId: post.id,
      presignedUrl: {
        ...presigned,
        mediaId: media.id,
      },
    };
  }

  // ============== CONFIRM TEMP MEDIA============== //
  async confirmTempMedia(
    authId: string,
    postId: string,
  ): Promise<{
    id: string;
    url: string;
    key: string;
    size: number;
    mimeType: string;
    type: MediaType;
  } | null> {
    const post = await this.prisma.post.findFirst({
      where: {
        id: postId,
        userId: authId,
        deletedAt: null,
      },
      include: {
        media: {
          where: { isTemp: true },
          take: 1,
        },
      },
    });

    if (!post) {
      throw new NotFoundException('POST_NOT_FOUND', 'post.errors.notFound');
    }

    const media = post.media[0];

    if (!media) {
      return null;
    }

    const key = media.url;

    // ------------ VALIDATE TEMP PATH ------------ //
    if (!key.startsWith(`temp/posts/${authId}/`)) {
      return null;
    }

    try {
      // ------------ FETCH METADATA ------------ //
      const metadata = await this.s3Service.headObject(key);

      // ------------ DETECT FILE TYPE ------------ //
      const fileExtension = extname(key).toLowerCase();

      const isVideo = (
        POST_CONFIG.VIDEO.ALLOWED_EXTENSIONS as readonly string[]
      ).includes(fileExtension);

      const isImage = (
        POST_CONFIG.IMAGE.ALLOWED_EXTENSIONS as readonly string[]
      ).includes(fileExtension);

      // ------------ VALIDATE FILE TYPE ------------ //
      if (!isVideo && !isImage) {
        throw new BadRequestException(
          'INVALID_FILE_TYPE',
          'post.errors.invalidFileType',
          {
            fileExtension,
            allowed: [
              ...POST_CONFIG.VIDEO.ALLOWED_EXTENSIONS,
              ...POST_CONFIG.IMAGE.ALLOWED_EXTENSIONS,
            ].join(', '),
          },
        );
      }

      // ------------ FETCH FILE BUFFER ------------ //
      const fileBuffer = await this.s3Service.getFileBuffer(key);

      // ------------ VALIDATE FILE INTEGRITY ------------ //
      if (isVideo) {
        this.s3Service.validateVideoIntegrity(fileBuffer, fileExtension);
      } else if (isImage) {
        this.s3Service.validateImageIntegrity(fileBuffer, fileExtension);
      }

      // ------------ GENERATE FILE HASH ------------ //
      const mediaHash = createHash('sha256').update(fileBuffer).digest('hex');

      // ------------ EXTRACT FILE DETAILS ------------ //
      const size = metadata.ContentLength ?? 0;

      const mimeType =
        metadata.ContentType ?? (isVideo ? 'video/mp4' : 'image/jpeg');

      // ------------ UPDATE MEDIA RECORD ------------ //
      await this.prisma.postMedia.update({
        where: { id: media.id },
        data: {
          size: String(size),
          mimeType,
          mediaHash,
          isTemp: true,

          // Images are immediately completed
          // Videos go into processing queue
          processingStatus: isVideo
            ? MediaProcessingStatus.PENDING
            : MediaProcessingStatus.COMPLETED,
        },
      });

      // ------------ GENERATE SIGNED URL ------------ //
      const signedUrl = await this.s3Service.getSignedUrl(key);

      const result = {
        id: media.id,
        url: signedUrl ?? key,
        key,
        size,
        mimeType,
        type: media.type,
      };

      // ------------ SEND VIDEO FOR COMPRESSION ------------ //
      if (isVideo) {
        await this.sendCompressionPayloads(authId, postId, [
          {
            id: result.id,
            url: result.url,
            key: result.key,
            mimeType: result.mimeType,
            type: 'VIDEO',
          },
        ]);

        // ------------ SEND VIDEO FOR THUMBNAIL GENERATION ------------ //
        await this.sqsService.sendThumbnailGenerationMessage(
          postId,
          result.key,
          authId,
        );
      }

      return result;
    } catch (error: unknown) {
      this.rethrowCorruptionError(error);

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.warn(`Failed to confirm temp media ${key}: ${errorMessage}`);

      await this.prisma.postMedia.update({
        where: { id: media.id },
        data: {
          processingStatus: MediaProcessingStatus.FAILED,
        },
      });

      throw error;
    }
  }

  // ============== FINAL PUBLISH GATE: VALIDATE → MOVE S3 → UPDATE DB ============== //
  async confirmNewUpload(
    authId: string,
    dto: ConfirmNewUploadDto,
  ): Promise<ConfirmedPostResponseDto> {
    const descriptionTrimmed = dto.description?.trim() ?? '';

    if (!descriptionTrimmed) {
      throw new BadRequestException(
        'CAPTION_REQUIRED',
        'post.validation.captionRequired',
      );
    }

    // ------------ FETCH ACCOUNT TYPE ------------ //
    const author = await this.prisma.user.findUnique({
      where: { id: authId },
      select: { isPrivate: true },
    });

    if (!author) {
      throw new NotFoundException('USER_NOT_FOUND', 'post.errors.userNotFound');
    }

    // Create text-only post
    if (!dto.postId) {
      const visibility = dto.visibility ?? Visibility.PRIVATE;
      this.validateVisibilityForAccountType(author.isPrivate, visibility);

      const createdPost = await this.prisma.post.create({
        data: {
          userId: authId,
          description: descriptionTrimmed,
          visibility,
          status: PostStatus.PUBLISHED,
          activityDate: new Date(),
        },
      });

      await this.updateUserStreak(authId, createdPost.activityDate);
      this.logger.log(`Text-only post ${createdPost.id} created successfully`);
      return this.getPostById(authId, createdPost.id);
    }

    // Fetch existing post
    const postId = dto.postId.trim();
    const post = await this.prisma.post.findFirst({
      where: { id: postId, userId: authId, deletedAt: null },
      include: { media: { take: 1 } },
    });

    if (!post) {
      throw new NotFoundException('POST_NOT_FOUND', 'post.errors.notFound');
    }

    const visibility = dto.visibility ?? post.visibility;
    this.validateVisibilityForAccountType(author.isPrivate, visibility);

    // Update metadata
    await this.prisma.post.update({
      where: { id: postId },
      data: {
        description: descriptionTrimmed,
        visibility,
        activityDate: post.activityDate ?? new Date(),
      },
    });

    // Publish text-only existing post
    if (post.media.length === 0) {
      const now = new Date();

      await this.prisma.post.update({
        where: {
          id: postId,
        },

        data: {
          status: PostStatus.PUBLISHED,
          updatedAt: now,
        },
      });

      await this.updateUserStreak(authId, post.activityDate ?? now);

      this.logger.log(
        `Text-only existing post ${postId} published successfully`,
      );

      return this.getPostById(authId, postId);
    }

    // Get single media
    const media = post.media[0];

    // Validate processing status
    if (media.processingStatus !== MediaProcessingStatus.COMPLETED) {
      if (media.processingStatus === MediaProcessingStatus.FAILED) {
        await this.prisma.post.update({
          where: {
            id: postId,
          },

          data: {
            status: PostStatus.REJECTED,
          },
        });

        throw new BadRequestException(
          'POST_VIOLATED',
          'post.errors.postViolated',
        );
      }

      throw new BadRequestException(
        'AI_PROCESSING_INCOMPLETE',
        'post.errors.aiProcessingIncomplete',
      );
    }

    // Move file to permanent storage
    const sourceKey = media.compressedKey || media.url;

    const ext =
      extname(sourceKey) || (media.type === MediaType.VIDEO ? '.mp4' : '.jpg');

    const permanentBase = `posts/${authId}/${postId}`;

    const permanentKey = `${permanentBase}/${media.id}${ext}`;

    await this.s3Service.copyObject(sourceKey, permanentKey);

    if (sourceKey !== permanentKey) {
      await this.s3Service.deleteObjectByKey(sourceKey);
    }

    // ------------ MOVE THUMBNAIL TO PERMANENT STORAGE ------------ //
    let permanentThumbnailKey: string | null = null;

    if (media.thumbnailUrl) {
      const thumbnailExt = extname(media.thumbnailUrl) || '.png';

      permanentThumbnailKey = `${permanentBase}/thumbnails/${media.id}${thumbnailExt}`;

      await this.s3Service.copyObject(
        media.thumbnailUrl,
        permanentThumbnailKey,
      );

      if (media.thumbnailUrl !== permanentThumbnailKey) {
        await this.s3Service.deleteObjectByKey(media.thumbnailUrl);
      }
    }

    // Final DB update
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.postMedia.update({
        where: {
          id: media.id,
        },

        data: {
          url: permanentKey,
          thumbnailUrl: permanentThumbnailKey,
          compressedKey: null,
          isTemp: false,
          processingStatus: MediaProcessingStatus.COMPLETED,
        },
      }),

      this.prisma.post.update({
        where: {
          id: postId,
        },

        data: {
          status: PostStatus.PUBLISHED,
          updatedAt: now,
        },
      }),
    ]);

    // Update streak
    await this.updateUserStreak(authId, post.activityDate ?? now);

    // Return final response
    const finalResponse = await this.getPostById(authId, postId);

    this.logger.log(`Post ${postId} published successfully`);

    return finalResponse;
  }

  // ============== GET POST BY ID ============== //
  async getPostById(
    userId: string,
    postId: string,
  ): Promise<ConfirmedPostResponseDto> {
    // ------------ FIND USER ------------ //
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND', 'common.errors.notFound');
    }

    // ------------ FIND POST ------------ //
    const post = await this.prisma.post.findFirst({
      where: {
        id: postId,
        deletedAt: null,
      },
      include: {
        media: {
          where: { isTemp: false },
          take: 1,
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profileImage: true,
          },
        },
        postCheers: {
          where: { cheeredById: user.id },
          select: { id: true },
        },
        _count: {
          select: { postCheers: true },
        },
      },
    });

    if (!post) {
      throw new NotFoundException('POST_NOT_FOUND', 'post.errors.notFound');
    }

    const isOwner = post.user.id === user.id;

    const followRelation = isOwner
      ? null
      : await this.prisma.follow.findFirst({
          where: {
            followerId: user.id,
            followingId: post.user.id,
          },
          select: { status: true },
        });

    if (!isOwner) {
      const isPublished = post.status === PostStatus.PUBLISHED;
      const canView =
        post.visibility === Visibility.PUBLIC ||
        post.visibility === Visibility.FOLLOWERS;

      if (!isPublished || !canView) {
        throw new NotFoundException('POST_NOT_FOUND', 'post.errors.notFound');
      }
    }

    // ------------ SINGLE MEDIA ------------ //
    let media: PostMediaResponseDto | null = null;

    if (post.media.length > 0) {
      const item = post.media[0];

      media = new PostMediaResponseDto();

      media.id = item.id;
      media.type = item.type;

      // ------------ MAIN MEDIA URL ------------ //
      media.url = await this.s3Service.getSignedUrl(item.url);

      // ------------ THUMBNAIL URL ------------ //
      media.thumbnailUrl = item.thumbnailUrl
        ? await this.s3Service.getSignedUrl(item.thumbnailUrl)
        : null;

      media.mimeType = item.mimeType;
      media.size = item.size;
    }

    // ------------ FOLLOW STATUS ------------ //
    let followStatus: 'FOLLOWING' | 'REQUESTED' | 'NOT_FOLLOWING' =
      'NOT_FOLLOWING';

    if (followRelation?.status === 'ACCEPTED') {
      followStatus = 'FOLLOWING';
    }

    if (followRelation?.status === 'PENDING') {
      followStatus = 'REQUESTED';
    }

    // ------------ PROFILE ------------ //
    const profile = new PostAuthorProfileDto();
    profile.id = post.user.id;
    profile.fullName = `${post.user.firstName} ${post.user.lastName}`.trim();
    profile.profileImage = post.user.profileImage
      ? await this.s3Service.getSignedUrl(post.user.profileImage)
      : null;
    profile.followStatus = followStatus;
    profile.isMe = isOwner;

    // ------------ BUILD RESPONSE ------------ //
    const response = new ConfirmedPostResponseDto();

    response.id = post.id;
    response.description = post.description;
    response.visibility = post.visibility;
    response.status = post.status;
    response.activityDate = post.activityDate;
    response.createdAt = post.createdAt;
    response.media = media;
    response.profile = profile;
    response.isCheered = post.postCheers.length > 0;
    response.cheerCount = post._count.postCheers;

    return response;
  }

  // ============== UPDATE POST ============== //
  async updatePost(
    userId: string,
    postId: string,
    dto: UpdatePostDto,
  ): Promise<ConfirmedPostResponseDto> {
    // ------------ FIND USER ------------ //
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND', 'post.errors.userNotFound');
    }

    // ------------ FIND POST ------------ //
    const post = await this.prisma.post.findFirst({
      where: {
        id: postId,
        userId: user.id,
        deletedAt: null,
      },
      include: {
        media: {
          where: { isTemp: false },
          take: 1,
        },
      },
    });

    if (!post) {
      throw new NotFoundException('POST_NOT_FOUND', 'post.errors.notFound');
    }

    // ------------ UPDATE POST ------------ //
    const updatedPost = await this.prisma.post.update({
      where: {
        id: postId,
      },
      data: {
        description: dto.description,
      },
      include: {
        media: {
          where: { isTemp: false },
          take: 1,
        },
      },
    });

    // ------------ SINGLE MEDIA ------------ //
    let media: PostMediaResponseDto | null = null;

    if (updatedPost.media.length > 0) {
      const item = updatedPost.media[0];

      media = new PostMediaResponseDto();
      media.id = item.id;
      media.type = item.type;
      media.url = await this.s3Service.getSignedUrl(item.url);
      media.mimeType = item.mimeType;
      media.size = item.size;
    }

    // ------------ BUILD RESPONSE ------------ //
    const response = new ConfirmedPostResponseDto();

    response.id = updatedPost.id;
    response.description = updatedPost.description;
    response.visibility = updatedPost.visibility;
    response.status = updatedPost.status;
    response.activityDate = updatedPost.activityDate;
    response.createdAt = updatedPost.createdAt;
    response.media = media;

    return response;
  }

  // ============== GET FEED ============== //
  async getFeed(userId: string, dto: GetFeedDto): Promise<FeedResponseDto> {
    // ------------ VALIDATE USER ------------ //
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!currentUser) {
      throw new NotFoundException('USER_NOT_FOUND', 'post.errors.userNotFound');
    }

    // ------------ PAGINATION ------------ //
    const { page, limit, skip } = getPaginationParams(dto);

    // ------------ BUILD WHERE ------------ //
    const where: Prisma.PostWhereInput = {
      deletedAt: null,
      status: PostStatus.PUBLISHED,
    };

    if (!dto.userId) {
      // ------------ GENERAL FEED ------------ //
      where.visibility = {
        in: [Visibility.PUBLIC, Visibility.FOLLOWERS],
      };
    } else if (dto.userId === currentUser.id) {
      // ------------ OWN PROFILE ------------ //
      where.userId = currentUser.id;

      // ------------ VISIBILITY REQUIRED ------------ //
      if (!dto.visibility) {
        throw new BadRequestException(
          'VISIBILITY_REQUIRED',
          'post.validation.visibilityRequired',
        );
      }

      where.visibility = dto.visibility;
    } else {
      // ------------ OTHER USER'S PROFILE ------------ //
      where.userId = dto.userId;

      const isFollowing = await this.prisma.follow.findFirst({
        where: {
          followerId: currentUser.id,
          followingId: dto.userId,
          status: 'ACCEPTED',
        },
        select: {
          id: true,
        },
      });

      where.visibility = isFollowing
        ? {
            in: [Visibility.PUBLIC, Visibility.FOLLOWERS],
          }
        : Visibility.PUBLIC;
    }

    // ------------ FETCH POSTS ------------ //
    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,

        include: {
          media: {
            where: {
              isTemp: false,
            },
            take: 1,
          },

          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImage: true,
            },
          },

          // ------------ CURRENT USER CHEER ------------ //
          postCheers: {
            where: {
              cheeredById: currentUser.id,
            },
            select: {
              id: true,
            },
          },

          // ------------ CHEER COUNT ------------ //
          _count: {
            select: {
              postCheers: true,
            },
          },
        },

        orderBy: {
          createdAt: 'desc',
        },

        skip,
        take: limit,
      }),

      this.prisma.post.count({
        where,
      }),
    ]);

    // ------------ AUTHOR IDS ------------ //
    const authorIds = [...new Set(posts.map((post) => post.user.id))];

    // ------------ FOLLOW RELATIONS ------------ //
    const followRelations = await this.prisma.follow.findMany({
      where: {
        followerId: currentUser.id,
        followingId: {
          in: authorIds,
        },
      },
      select: {
        followingId: true,
        status: true,
      },
    });

    // ------------ RELATION MAP ------------ //
    const followMap = new Map(
      followRelations.map((relation) => [
        relation.followingId,
        relation.status,
      ]),
    );

    // ------------ MAP POSTS ------------ //
    const mappedPosts = await Promise.all(
      posts.map(async (post) => {
        // ------------ SINGLE MEDIA ------------ //
        let media: PostMediaResponseDto | null = null;

        if (post.media.length > 0) {
          const item = post.media[0];

          media = new PostMediaResponseDto();

          media.id = item.id;
          media.type = item.type;

          // ------------ MAIN MEDIA URL ------------ //
          media.url = await this.s3Service.getSignedUrl(item.url);

          // ------------ THUMBNAIL URL ------------ //
          media.thumbnailUrl = item.thumbnailUrl
            ? await this.s3Service.getSignedUrl(item.thumbnailUrl)
            : null;

          media.mimeType = item.mimeType;
          media.size = item.size;
        }

        // ------------ FOLLOW STATUS ------------ //
        const relationStatus = followMap.get(post.user.id);

        let followStatus: 'FOLLOWING' | 'REQUESTED' | 'NOT_FOLLOWING' =
          'NOT_FOLLOWING';

        if (relationStatus === 'ACCEPTED') {
          followStatus = 'FOLLOWING';
        }

        if (relationStatus === 'PENDING') {
          followStatus = 'REQUESTED';
        }

        // ------------ PROFILE ------------ //
        const profile = new PostAuthorProfileDto();

        profile.id = post.user.id;

        profile.fullName =
          `${post.user.firstName} ${post.user.lastName}`.trim();

        profile.profileImage = post.user.profileImage
          ? await this.s3Service.getSignedUrl(post.user.profileImage)
          : null;

        profile.followStatus = followStatus;

        profile.isMe = currentUser.id === post.user.id;

        // ------------ RESPONSE ------------ //
        const response = new ConfirmedPostResponseDto();

        response.id = post.id;
        response.description = post.description;
        response.visibility = post.visibility;
        response.status = post.status;
        response.activityDate = post.activityDate;
        response.createdAt = post.createdAt;

        response.media = media;
        response.profile = profile;

        // ------------ CHEER INFO ------------ //
        response.isCheered = post.postCheers.length > 0;

        response.cheerCount = post._count.postCheers;

        return response;
      }),
    );

    // ------------ RETURN ------------ //
    return {
      posts: mappedPosts,
      meta: calculatePaginationMeta(total, page, limit),
    };
  }

  // ============== GET USER POSTS ============== //
  async getUserPosts(
    currentUserId: string,
    targetUserId: string,
    dto: GetUserPostsDto,
  ): Promise<FeedResponseDto> {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: currentUserId },
    });

    if (!currentUser) {
      throw new NotFoundException('USER_NOT_FOUND', 'post.errors.userNotFound');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!targetUser) {
      throw new NotFoundException('USER_NOT_FOUND', 'post.errors.userNotFound');
    }

    const { page, limit, skip } = getPaginationParams(dto);

    const isMe = currentUser.id === targetUserId;

    let isFollowing = false;

    if (!isMe) {
      const followRelation = await this.prisma.follow.findFirst({
        where: {
          followerId: currentUser.id,
          followingId: targetUserId,
          status: 'ACCEPTED',
        },
        select: { id: true },
      });

      isFollowing = !!followRelation;
    }

    const where: Prisma.PostWhereInput = {
      userId: targetUserId,
      deletedAt: null,
      status: PostStatus.PUBLISHED,
      visibility: isMe
        ? {
            in: [Visibility.PUBLIC, Visibility.FOLLOWERS, Visibility.PRIVATE],
          }
        : isFollowing
          ? { in: [Visibility.PUBLIC, Visibility.FOLLOWERS] }
          : Visibility.PUBLIC,
    };

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: {
          media: {
            where: {
              isTemp: false,
            },
            take: 1,
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profileImage: true,
            },
          },
          postCheers: {
            where: {
              cheeredById: currentUser.id,
            },
            select: {
              id: true,
            },
          },
          _count: {
            select: {
              postCheers: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.post.count({ where }),
    ]);

    const authorIds = [...new Set(posts.map((post) => post.user.id))];

    const followRelations = await this.prisma.follow.findMany({
      where: {
        followerId: currentUser.id,
        followingId: {
          in: authorIds,
        },
      },
      select: {
        followingId: true,
        status: true,
      },
    });

    const followMap = new Map(
      followRelations.map((relation) => [
        relation.followingId,
        relation.status,
      ]),
    );

    const mappedPosts = await Promise.all(
      posts.map(async (post) => {
        let media: PostMediaResponseDto | null = null;

        if (post.media.length > 0) {
          const item = post.media[0];

          media = new PostMediaResponseDto();
          media.id = item.id;
          media.type = item.type;
          media.url = await this.s3Service.getSignedUrl(item.url);
          media.thumbnailUrl = item.thumbnailUrl
            ? await this.s3Service.getSignedUrl(item.thumbnailUrl)
            : null;
          media.mimeType = item.mimeType;
          media.size = item.size;
        }

        const relationStatus = followMap.get(post.user.id);

        let followStatus: 'FOLLOWING' | 'REQUESTED' | 'NOT_FOLLOWING' =
          'NOT_FOLLOWING';

        if (relationStatus === 'ACCEPTED') {
          followStatus = 'FOLLOWING';
        }

        if (relationStatus === 'PENDING') {
          followStatus = 'REQUESTED';
        }

        const profile = new PostAuthorProfileDto();
        profile.id = post.user.id;
        profile.fullName =
          `${post.user.firstName} ${post.user.lastName}`.trim();
        profile.profileImage = post.user.profileImage
          ? await this.s3Service.getSignedUrl(post.user.profileImage)
          : null;
        profile.followStatus = followStatus;
        profile.isMe = currentUser.id === post.user.id;

        const response = new ConfirmedPostResponseDto();
        response.id = post.id;
        response.description = post.description;
        response.visibility = post.visibility;
        response.status = post.status;
        response.activityDate = post.activityDate;
        response.createdAt = post.createdAt;
        response.media = media;
        response.profile = profile;
        response.isCheered = post.postCheers.length > 0;
        response.cheerCount = post._count.postCheers;

        return response;
      }),
    );

    return {
      posts: mappedPosts,
      meta: calculatePaginationMeta(total, page, limit),
    };
  }

  // ============== GET DAILY LOG ============== //
  async getDailyLog(
    userId: string,
    dto: PaginationDto,
  ): Promise<DailyLogResponseDto> {
    // ------------ FIND CURRENT USER ------------ //
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!currentUser) {
      throw new NotFoundException('USER_NOT_FOUND', 'post.errors.userNotFound');
    }

    // ------------ PAGINATION ------------ //
    const { page, limit, skip } = getPaginationParams(dto);

    // ------------ BUILD TODAY'S DATE RANGE ------------ //
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // ------------ COMMON WHERE ------------ //
    const where: Prisma.PostWhereInput = {
      userId,
      deletedAt: null,
      status: PostStatus.PUBLISHED,
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    };

    // ------------ FETCH TODAY'S PUBLISHED POSTS ------------ //
    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,

        include: {
          media: {
            where: {
              isTemp: false,
            },
            take: 1,
          },

          // ------------ CURRENT USER CHEER ------------ //
          postCheers: {
            where: {
              cheeredById: currentUser.id,
            },
            select: {
              id: true,
            },
          },

          // ------------ CHEER COUNT ------------ //
          _count: {
            select: {
              postCheers: true,
            },
          },
        },

        orderBy: {
          createdAt: 'desc',
        },

        skip,
        take: limit,
      }),

      this.prisma.post.count({
        where,
      }),
    ]);

    // ------------ MAP RESPONSE ------------ //
    const mappedPosts = await Promise.all(
      posts.map(async (post) => {
        // ------------ SINGLE MEDIA ------------ //
        let media: PostMediaResponseDto | null = null;

        if (post.media.length > 0) {
          const item = post.media[0];

          media = new PostMediaResponseDto();

          media.id = item.id;
          media.type = item.type;

          // ------------ MAIN MEDIA URL ------------ //
          media.url = await this.s3Service.getSignedUrl(item.url);

          // ------------ THUMBNAIL URL ------------ //
          media.thumbnailUrl = item.thumbnailUrl
            ? await this.s3Service.getSignedUrl(item.thumbnailUrl)
            : null;

          media.mimeType = item.mimeType;
          media.size = item.size;
        }

        // ------------ RESPONSE ------------ //
        const response = new ConfirmedPostResponseDto();

        response.id = post.id;
        response.description = post.description;
        response.visibility = post.visibility;
        response.status = post.status;
        response.activityDate = post.activityDate;
        response.createdAt = post.createdAt;

        response.media = media;

        // ------------ CHEER INFO ------------ //
        response.isCheered = post.postCheers.length > 0;
        response.cheerCount = post._count.postCheers;

        return response;
      }),
    );

    // ------------ RETURN ------------ //
    return {
      posts: mappedPosts,
      meta: calculatePaginationMeta(total, page, limit),
    };
  }

  // ============== DELETE POST ============== //
  async deletePost(userId: string, postId: string): Promise<void> {
    // ------------ FIND USER ------------ //
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND', 'post.errors.userNotFound');
    }

    // ------------ FIND POST ------------ //
    const post = await this.prisma.post.findFirst({
      where: {
        id: postId,
        userId,
        deletedAt: null,
      },
    });

    if (!post) {
      throw new NotFoundException('POST_NOT_FOUND', 'post.errors.notFound');
    }

    // ------------ SOFT DELETE ------------ //
    await this.prisma.post.update({
      where: {
        id: post.id,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    // ------------ RECALCULATE DAILY LOG ------------ //
    await this.recalculateDailyLog(userId, post.activityDate);

    // ------------ RECALCULATE STREAKS ------------ //
    await this.recalculateUserStreaks(userId);
  }

  // ============== UPDATE COMPRESSED MEDIA (called by Lambda) ============== //
  async updateCompressedMedia(dto: UpdateCompressedMediaDto): Promise<void> {
    const media = await this.prisma.postMedia.findUnique({
      where: { id: dto.mediaId },
    });

    if (!media) {
      throw new NotFoundException(
        'MEDIA_NOT_FOUND',
        'post.errors.mediaNotFound',
      );
    }

    await this.prisma.postMedia.update({
      where: { id: dto.mediaId },
      data: {
        compressedKey: dto.compressedKey ?? null,
        processingStatus: dto.processingStatus,
      },
    });
  }

  // ============== POLLING API (called by frontend) ============== //
  async getMediaProcessingStatus(
    authId: string,
    postId: string,
  ): Promise<{
    id: string;
    compressedKey: string | null;
    processingStatus: MediaProcessingStatus | null;
  }> {
    const post = await this.prisma.post.findFirst({
      where: {
        id: postId,
        userId: authId,
        deletedAt: null,
      },
      include: {
        media: {
          take: 1,
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!post) {
      throw new NotFoundException('POST_NOT_FOUND', 'post.errors.notFound');
    }

    const media = post.media[0];

    if (!media) {
      throw new NotFoundException(
        'MEDIA_NOT_FOUND',
        'post.errors.mediaNotFound',
      );
    }

    return {
      id: media.id,
      compressedKey: media.compressedKey,
      processingStatus: media.processingStatus,
    };
  }

  // ============== CHEER / UNCHEER POST (IDEMPOTENT) ============== //
  async toggleCheer(
    userId: string,
    postId: string,
    isCheered: boolean,
  ): Promise<{ isCheered: boolean; cheerCount: number }> {
    // ------------ VALIDATE USER EXISTS ------------ //
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND', 'common.errors.notFound');
    }

    // ------------ CHECK POST EXISTS ------------ //
    const post = await this.prisma.post.findFirst({
      where: {
        id: postId,
        deletedAt: null,
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!post) {
      throw new NotFoundException('POST_NOT_FOUND', 'post.errors.notFound');
    }

    // ------------ CHECK EXISTING CHEER ------------ //
    const existingCheer = await this.prisma.postCheer.findFirst({
      where: {
        postId,
        cheeredById: user.id,
      },
      select: {
        id: true,
      },
    });

    // ------------ ADD CHEER ------------ //
    if (isCheered && !existingCheer) {
      await this.prisma.postCheer.create({
        data: {
          postId,
          cheeredById: user.id,
        },
      });

      // ------------ AVOID SELF NOTIFICATIONS ------------ //
      if (post.userId !== user.id) {
        const displayName = `${user.firstName} ${user.lastName}`.trim();

        this.notificationService
          .upsertAndSend({
            userId: post.userId,
            actorId: user.id,
            postId,
            type: NotificationType.POST_CHEERED,
            title: 'Post Cheered',
            message: `${displayName} cheered your post`,
            upsertKey: {
              userId: post.userId,
              actorId: user.id,
              postId,
              type: NotificationType.POST_CHEERED,
            },
          })
          .catch((error) => {
            this.logger.error(
              `Failed to send cheer notification: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          });
      }
    }

    // ------------ REMOVE CHEER ------------ //
    if (!isCheered && existingCheer) {
      await this.prisma.postCheer.delete({
        where: {
          postId_cheeredById: {
            postId,
            cheeredById: user.id,
          },
        },
      });

      // ------------ DELETE NOTIFICATION ------------ //
      await this.notificationService.deleteNotifications({
        userId: post.userId,
        actorId: user.id,
        postId,
        type: NotificationType.POST_CHEERED,
      });
    }

    // ------------ FINAL COUNT ------------ //
    const cheerCount = await this.prisma.postCheer.count({
      where: {
        postId,
      },
    });

    return {
      isCheered,
      cheerCount,
    };
  }

  // ============== UPDATE POST THUMBNAIL ============== //
  async updateThumbnail(
    postId: string,
    thumbnailUrl: string,
    videoUrl: string,
  ): Promise<void> {
    const normalizeS3Key = (value: string): string => {
      const raw = value.trim();
      if (!raw) return raw;

      try {
        const url = new URL(raw);
        return decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      } catch {
        return decodeURIComponent(raw.split('?')[0].replace(/^\/+/, ''));
      }
    };
    const getBaseName = (value: string): string => {
      const key = normalizeS3Key(value);
      const parts = key.split('/');
      return parts[parts.length - 1] ?? key;
    };

    const targetVideoKey = normalizeS3Key(videoUrl);
    const targetVideoBaseName = getBaseName(videoUrl);

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { media: true },
    });

    if (!post) {
      throw new NotFoundException('POST_NOT_FOUND', 'post.errors.notFound');
    }

    const media = post.media.find((m) => {
      const mediaKey = normalizeS3Key(m.url);
      const mediaBaseName = getBaseName(m.url);
      return (
        mediaKey === targetVideoKey || mediaBaseName === targetVideoBaseName
      );
    });

    if (!media) {
      this.logger.warn(
        `Media not found for videoUrl=${videoUrl} (normalized=${targetVideoKey}) in post=${postId}. Existing media keys=[${post.media
          .map((m) => normalizeS3Key(m.url))
          .join(', ')}]`,
      );
      // Fallback:
      const videoMedia = post.media.filter((m) => m.type === MediaType.VIDEO);
      if (videoMedia.length === 1) {
        await this.prisma.postMedia.update({
          where: { id: videoMedia[0].id },
          data: { thumbnailUrl },
        });
        this.logger.log(
          `Thumbnail fallback update applied for single video media ${videoMedia[0].id} in post: ${postId}`,
        );
      }
      return;
    }

    await this.prisma.postMedia.update({
      where: { id: media.id },
      data: { thumbnailUrl },
    });

    this.logger.log(
      `Thumbnail updated for media ${media.id} in post: ${postId} (videoKey=${targetVideoKey})`,
    );
  }

  // ============== HELPER FUNCTIONS ============== //

  private async sendCompressionPayloads(
    authId: string,
    postId: string,
    confirmedMedia: Array<{
      id: string;
      url: string;
      key: string;
      mimeType: string;
      type: 'VIDEO';
    }>,
  ): Promise<void> {
    const bucket = process.env.AWS_BUCKET_NAME ?? '';

    if (!bucket) {
      this.logger.warn(
        'AWS_BUCKET_NAME not set. Skipping compression payloads.',
      );
      return;
    }

    this.logger.log(
      `Sending compression payloads for post ${postId} — ${confirmedMedia.length} video file(s)`,
    );

    await Promise.all(
      confirmedMedia.map(async (m) => {
        const payload: CompressionMessagePayload = {
          authId: authId,
          postId,
          bucket,
          media: {
            id: m.id,
            type: 'VIDEO',
            key: m.key,
            url: m.url,
            mimeType: m.mimeType,
          },
        };

        this.logger.log(
          `Dispatching compression message for video ${m.id} (key=${m.key})`,
        );

        await this.sqsService.sendCompressionMessage(payload);

        this.logger.log(
          `Successfully sent compression message for video ${m.id} (postId=${postId})`,
        );
      }),
    );

    this.logger.log(
      `Finished dispatching compression payloads for post ${postId}`,
    );
  }

  async generatePresignedUrl(
    authId: string,
    dto: GeneratePresignedUrlDto,
  ): Promise<PresignedUrlResponseDto> {
    // ------------ VALIDATE MEDIA TYPE ------------ //
    if (dto.type !== MediaType.IMAGE && dto.type !== MediaType.VIDEO) {
      throw new BadRequestException(
        'INVALID_MEDIA_TYPE',
        'post.errors.invalidMediaType',
      );
    }

    const isVideo = dto.type === MediaType.VIDEO;

    // ------------ CONFIG BASED ON MEDIA TYPE ------------ //
    const maxSize = isVideo
      ? POST_CONFIG.VIDEO.MAX_SIZE_BYTES
      : POST_CONFIG.IMAGE.MAX_SIZE_BYTES;

    const allowedExtensions = isVideo
      ? POST_CONFIG.VIDEO.ALLOWED_EXTENSIONS
      : POST_CONFIG.IMAGE.ALLOWED_EXTENSIONS;

    const allowedMimeTypes = isVideo
      ? POST_CONFIG.VIDEO.ALLOWED_TYPES
      : POST_CONFIG.IMAGE.ALLOWED_TYPES;

    // ------------ VALIDATE FILE SIZE ------------ //
    if (dto.size > maxSize) {
      throw new BadRequestException(
        'FILE_SIZE_EXCEEDED',
        'post.errors.fileSizeExceeded',
        {
          maxSize: isVideo
            ? POST_CONFIG.VIDEO.MAX_SIZE_MB
            : POST_CONFIG.IMAGE.MAX_SIZE_MB,
        },
      );
    }

    // ------------ VALIDATE FILE EXTENSION ------------ //
    const fileExtension = extname(dto.fileName).toLowerCase();

    if (!(allowedExtensions as readonly string[]).includes(fileExtension)) {
      throw new BadRequestException(
        'INVALID_FILE_TYPE',
        'post.errors.invalidFileType',
        {
          fileExtension,
          allowed: allowedExtensions.join(', '),
        },
      );
    }

    // ------------ GENERATE UNIQUE FILE NAME ------------ //
    const baseFileName = dto.fileName.replace(fileExtension, '');

    const uniqueFileName = `${uuidv4()}-${baseFileName}${fileExtension}`;

    // ------------ DETERMINE MIME TYPE ------------ //
    const mimeType = allowedMimeTypes[0] ?? 'application/octet-stream';

    // ------------ GENERATE PRE-SIGNED URL ------------ //
    const folder = `temp/posts/${authId}`;

    const { url, key } = await this.s3Service.generatePresignedUrl(
      folder,
      uniqueFileName,
      mimeType,
      allowedExtensions,
      allowedMimeTypes,
    );

    return {
      url,
      key,
      expiresIn: POST_CONFIG.PRESIGNED_URL_EXPIRATION,
      fileName: uniqueFileName,
    };
  }

  // ============== VALIDATE VISIBILITY AGAINST ACCOUNT TYPE ============== //
  private validateVisibilityForAccountType(
    isPrivate: boolean,
    visibility: Visibility,
  ): void {
    const allowed: Visibility[] = isPrivate
      ? [Visibility.PRIVATE, Visibility.FOLLOWERS]
      : [Visibility.PRIVATE, Visibility.PUBLIC];

    if (!allowed.includes(visibility)) {
      throw new BadRequestException(
        'INVALID_VISIBILITY_FOR_ACCOUNT_TYPE',
        'post.errors.invalidVisibilityForAccountType',
        { isPrivate, visibility, allowed },
      );
    }
  }

  private rethrowCorruptionError(error: unknown): void {
    if (!(error instanceof BadRequestException)) return;
    const response = error.getResponse();
    const errorCode =
      typeof response === 'object' &&
      response !== null &&
      'errorCode' in response
        ? (response as Record<string, unknown>).errorCode
        : null;
    if (errorCode === 'CORRUPT_IMAGE' || errorCode === 'CORRUPT_VIDEO') {
      throw error;
    }
  }

  private formatFileSize(bytes: number | undefined): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i] ?? 'B'}`;
  }

  private async updateUserStreak(
    userId: string,
    activityDate: Date,
  ): Promise<void> {
    // ------------ NORMALIZE DATE ------------ //
    const currentDate = new Date(activityDate);

    currentDate.setHours(0, 0, 0, 0);

    // ------------ FETCH USER ------------ //
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        currentStreak: true,
        highestStreak: true,
        lastStreakDate: true,
      },
    });

    if (!user) {
      return;
    }

    // ------------ FIRST STREAK ------------ //
    if (!user.lastStreakDate) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          currentStreak: 1,
          highestStreak: Math.max(user.highestStreak, 1),
          lastStreakDate: currentDate,
        },
      });

      return;
    }

    // ------------ NORMALIZE LAST DATE ------------ //
    const lastDate = new Date(user.lastStreakDate);

    lastDate.setHours(0, 0, 0, 0);

    // ------------ CALCULATE DAY DIFFERENCE ------------ //
    const diffDays = Math.floor(
      (currentDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    // ------------ SAME DAY ------------ //
    // Already counted
    if (diffDays === 0) {
      return;
    }

    // ------------ CONSECUTIVE DAY ------------ //
    if (diffDays === 1) {
      const newCurrentStreak = user.currentStreak + 1;

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          currentStreak: newCurrentStreak,

          highestStreak: Math.max(user.highestStreak, newCurrentStreak),

          lastStreakDate: currentDate,
        },
      });

      await this.streakAchieveService.notifyMilestoneIfReached(
        userId,
        newCurrentStreak,
      );
      return;
    }

    // ------------ STREAK RESET ------------ //
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        currentStreak: 1,

        highestStreak: Math.max(user.highestStreak, 1),

        lastStreakDate: currentDate,
      },
    });
  }

  private async recalculateUserStreaks(userId: string): Promise<void> {
    const logs = await this.prisma.dailyLog.findMany({
      where: {
        userId,
        goalCompleted: true,
      },
      orderBy: {
        logDate: 'desc',
      },
    });

    let currentStreak = 0;
    let highestStreak = 0;
    let tempStreak = 0;
    let lastStreakDate: Date | null = null;

    let expectedDate = new Date();
    expectedDate.setHours(0, 0, 0, 0);

    let currentStreakActive = true;

    for (const log of logs) {
      const logDate = new Date(log.logDate);
      logDate.setHours(0, 0, 0, 0);

      const diff =
        (expectedDate.getTime() - logDate.getTime()) / (1000 * 60 * 60 * 24);

      if (diff === 0) {
        tempStreak++;

        if (currentStreakActive) {
          currentStreak = tempStreak;
          if (!lastStreakDate) {
            lastStreakDate = logDate;
          }
        }

        highestStreak = Math.max(highestStreak, tempStreak);

        expectedDate.setDate(expectedDate.getDate() - 1);
      } else if (diff === 1) {
        // First log may be yesterday (streak still alive until end of today).
        tempStreak++;

        if (currentStreakActive) {
          currentStreak = tempStreak;
          if (!lastStreakDate) {
            lastStreakDate = logDate;
          }
        }

        highestStreak = Math.max(highestStreak, tempStreak);

        expectedDate = new Date(logDate);
        expectedDate.setDate(expectedDate.getDate() - 1);
      } else {
        currentStreakActive = false;
        tempStreak = 1;

        highestStreak = Math.max(highestStreak, tempStreak);

        expectedDate = new Date(logDate);
        expectedDate.setDate(expectedDate.getDate() - 1);
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        currentStreak,
        highestStreak,
        ...(lastStreakDate ? { lastStreakDate } : {}),
      },
    });
  }

  private async recalculateDailyLog(
    userId: string,
    activityDate: Date,
  ): Promise<void> {
    // ------------ NORMALIZE DATE ------------ //
    const startOfDay = new Date(activityDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(activityDate);
    endOfDay.setHours(23, 59, 59, 999);

    // ------------ DAILY TARGET ------------ //
    const targetCount = 1;

    // ------------ COUNT PUBLISHED POSTS ------------ //
    const completedCount = await this.prisma.post.count({
      where: {
        userId,
        status: PostStatus.PUBLISHED,
        deletedAt: null,
        activityDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    // ------------ CALCULATE BANK ------------ //
    const bankCount = Math.max(completedCount - targetCount, 0);

    // ------------ GOAL STATUS ------------ //
    const goalCompleted = completedCount >= targetCount;

    // ------------ UPSERT DAILY LOG ------------ //
    await this.prisma.dailyLog.upsert({
      where: {
        userId_logDate: {
          userId,
          logDate: startOfDay,
        },
      },

      create: {
        userId,
        logDate: startOfDay,
        targetCount,
        completedCount,
        bankCount,
        goalCompleted,
      },

      update: {
        completedCount,
        bankCount,
        goalCompleted,
      },
    });
  }
}
