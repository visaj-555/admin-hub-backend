import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { PostService } from './post.service';
import {
  CreatePostResponseDto,
  UpdatePostDto,
} from './dto/payloads/post.create.dto';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { GetUser } from 'src/common/decorators/get-user';
import { I18n, I18nContext } from 'nestjs-i18n';
import { ApiResponse, PaginationDto } from 'src/common/common.exports';
import type { JwtPayload } from '../auth/interfaces/auth.interface';
import {
  ConfirmedPostResponseDto,
  GenerateTempPresignedUrlDto,
} from './dto/responses/post.create.response';
import {
  DailyLogResponseDto,
  FeedResponseDto,
} from './dto/responses/post.feed.response';
import { GetFeedDto } from './dto/payloads/post.feed.dto';
import { GetUserPostsDto } from './dto/payloads/post.user-posts.dto';
import {
  ConfirmNewUploadDto,
  UpdateCompressedMediaDto,
  UpdateThumbnailDto,
} from './dto/payloads/post.media.dto';
import { ToggleCheerDto } from './dto/payloads/post.cheer.dto';
import { MediaProcessingStatus } from 'generated/prisma/enums';
@ApiTags('Post')
@Controller('posts')
export class PostController {
  constructor(private readonly postService: PostService) {}

  @ApiTags('Post Creation Pipeline')
  @Post('temp-presigned')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Generate temp presigned URL and create draft post',
  })
  @ApiCreatedResponse({
    description: 'Temp upload URL generated successfully',
    type: CreatePostResponseDto,
  })
  async generateTempPresignedUrl(
    @GetUser() user: JwtPayload,
    @Body() dto: GenerateTempPresignedUrlDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<CreatePostResponseDto>> {
    const result = await this.postService.generateTempPresignedUrl(
      user.userId,
      dto,
    );
    return ApiResponse.success(result, i18n.t('post.success.tempUrlGenerated'));
  }

  @ApiTags('Post Creation Pipeline')
  @Post('confirm-temp/:postId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Confirm uploaded temp media and start compression',
  })
  @ApiAcceptedResponse({
    description: 'Temp media confirmed successfully',
  })
  async confirmTempMedia(
    @GetUser() user: JwtPayload,
    @Param('postId') postId: string,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<any>> {
    const result = await this.postService.confirmTempMedia(user.userId, postId);

    return ApiResponse.success(
      result,
      i18n.t('post.success.tempMediaConfirmed'),
    );
  }

  @ApiTags('Post Creation Pipeline')
  @Post('publish')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Publish post after compression is done' })
  @ApiOkResponse({
    description: 'Post published successfully',
    type: ConfirmedPostResponseDto,
  })
  async confirmNewUpload(
    @GetUser() user: JwtPayload,
    @Body() dto: ConfirmNewUploadDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<ConfirmedPostResponseDto>> {
    const result = await this.postService.confirmNewUpload(user.userId, dto);
    return ApiResponse.success(result, i18n.t('post.success.postPublished'));
  }

  @ApiTags('Post Creation Pipeline')
  @ApiExtraModels(ApiResponse)
  @Get('polling/:postId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get media processing status' })
  @ApiOkResponse({
    description: 'Media processing status fetched successfully',
  })
  async getMediaProcessingStatus(
    @GetUser() user: JwtPayload,
    @Param('postId') postId: string,
    @I18n() i18n: I18nContext,
  ): Promise<
    ApiResponse<{
      id: string;
      compressedKey: string | null;
      processingStatus: MediaProcessingStatus | null;
    }>
  > {
    const result = await this.postService.getMediaProcessingStatus(
      user.userId,
      postId,
    );
    return ApiResponse.success(
      result,
      i18n.t('post.success.mediaProcessingFetched'),
    );
  }

  @Post('cheer')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Cheer or uncheer a post' })
  @ApiOkResponse({ description: 'Post cheer status updated successfully' })
  async toggleCheer(
    @GetUser() user: JwtPayload,
    @Body() dto: ToggleCheerDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<{ isCheered: boolean; cheerCount: number }>> {
    const result = await this.postService.toggleCheer(
      user.userId,
      dto.postId,
      dto.isCheered,
    );
    return ApiResponse.success(result, i18n.t('post.success.cheerUpdated'));
  }

  @ApiExtraModels(ApiResponse)
  @Get('daily-log')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user published posts for today' })
  async getDailyLog(
    @GetUser() user: JwtPayload,
    @Query() dto: PaginationDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<DailyLogResponseDto>> {
    const result = await this.postService.getDailyLog(user.userId, dto);

    return ApiResponse.success(result, i18n.t('post.success.dailyLogFetched'));
  }

  @ApiExtraModels(ApiResponse)
  @Get('feed')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get feed posts' })
  async getFeed(
    @GetUser() user: JwtPayload,
    @Query() dto: GetFeedDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<FeedResponseDto>> {
    const result = await this.postService.getFeed(user.userId, dto);
    return ApiResponse.success(result, i18n.t('post.success.feedFetched'));
  }

  @ApiExtraModels(ApiResponse)
  @Get('user/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Get a user’s posts. Followers see PUBLIC and FOLLOWERS posts; non-followers see PUBLIC only. Owner sees all.',
  })
  @ApiParam({ name: 'userId', description: 'Target user id' })
  @ApiOkResponse({
    description: 'User posts fetched successfully',
    type: FeedResponseDto,
  })
  async getUserPosts(
    @GetUser() user: JwtPayload,
    @Param('userId') userId: string,
    @Query() dto: GetUserPostsDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<FeedResponseDto>> {
    const result = await this.postService.getUserPosts(
      user.userId,
      userId,
      dto,
    );
    return ApiResponse.success(result, i18n.t('post.success.userPostsFetched'));
  }

  @ApiExtraModels(ApiResponse)
  @Get(':postId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get post by id' })
  @ApiOkResponse({
    description: 'Post fetched successfully',
    type: ConfirmedPostResponseDto,
  })
  async getPostById(
    @GetUser() user: JwtPayload,
    @Param('postId') postId: string,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<ConfirmedPostResponseDto>> {
    const post = await this.postService.getPostById(user.userId, postId);
    return ApiResponse.success(post, i18n.t('post.success.fetched'));
  }

  @ApiExtraModels(ApiResponse)
  @Patch('media/compressed')
  @ApiOperation({ summary: 'Update compressed media after Lambda compression' })
  @ApiOkResponse({ description: 'Compressed media updated successfully' })
  async updateCompressedMedia(
    @Body() dto: UpdateCompressedMediaDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<null>> {
    await this.postService.updateCompressedMedia(dto);
    return ApiResponse.success(
      null,
      i18n.t('post.success.compressedMediaUpdated'),
    );
  }

  @ApiExtraModels(ApiResponse)
  @Patch(':postId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update post description' })
  @ApiOkResponse({
    description: 'Post updated successfully',
    type: ConfirmedPostResponseDto,
  })
  async updatePost(
    @GetUser() user: JwtPayload,
    @Param('postId') postId: string,
    @Body() dto: UpdatePostDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<ConfirmedPostResponseDto>> {
    const post = await this.postService.updatePost(user.userId, postId, dto);
    return ApiResponse.success(post, i18n.t('post.success.updated'));
  }

  @ApiExtraModels(ApiResponse)
  @Delete(':postId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete post' })
  @ApiOkResponse({
    description: 'Post deleted successfully',
    type: ApiResponse,
  })
  async deletePost(
    @GetUser() user: JwtPayload,
    @Param('postId') postId: string,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<null>> {
    await this.postService.deletePost(user.userId, postId);
    return ApiResponse.success(null, i18n.t('post.success.deleted'));
  }

  @ApiExtraModels(ApiResponse, UpdateThumbnailDto)
  @Patch('thumbnail/:postId')
  @ApiOperation({
    summary: 'Update post thumbnail (called by Lambda function)',
  })
  @ApiParam({ name: 'postId', description: 'Post ID' })
  @ApiBody({ type: UpdateThumbnailDto })
  @ApiOkResponse({
    description: 'Post thumbnail updated successfully',
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiResponse) },
        {
          properties: {
            success: { type: 'boolean', example: true },
            statusCode: { type: 'number', example: 200 },
            message: {
              type: 'string',
              example: 'Post thumbnail updated successfully',
            },
            data: { type: 'null', example: null },
          },
        },
      ],
    },
  })
  async updateThumbnail(
    @Param('postId') postId: string,
    @Body() dto: UpdateThumbnailDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<null>> {
    await this.postService.updateThumbnail(
      postId,
      dto.thumbnailUrl,
      dto.videoUrl,
    );
    return ApiResponse.success(null, i18n.t('post.success.thumbnailUpdated'));
  }
}
