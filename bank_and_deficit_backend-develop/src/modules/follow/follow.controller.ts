import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  UseGuards,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiOkResponse,
  ApiBearerAuth,
  ApiTags,
} from '@nestjs/swagger';
import { I18n, I18nContext } from 'nestjs-i18n';
import { ApiResponse, PaginationMeta } from 'src/common/common.exports';
import { GetUser } from 'src/common/decorators/get-user';
import type { JwtPayload } from 'src/modules/auth/interfaces/auth.interface';
import { JwtAuthGuard } from 'src/modules/auth/guards/auth.guard';
import { FollowService } from './follow.service';
import {
  FollowListDto,
  FollowResponseDto,
  UserFollowListDto,
} from './dto/follow.response.dto';
import {
  SendFollowRequestDto,
  UpdateFollowStatusDto,
} from './dto/payloads/follow.payload.dto';
import { FollowStatus } from 'generated/prisma/client';
import { FollowAction } from './follow.interface';

@ApiTags('Follow')
@Controller('follow')
export class FollowController {
  constructor(private readonly followService: FollowService) {}

  @Post('toggle')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Toggle follow/unfollow a user' })
  @ApiOkResponse({
    type: FollowResponseDto,
    description: 'Follow toggled successfully',
  })
  async toggleFollow(
    @GetUser() user: JwtPayload,
    @Body() dto: SendFollowRequestDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<FollowResponseDto | null>> {
    const result = await this.followService.toggleFollow(
      user.userId,
      dto.followingId,
    );

    const { action, follow } = result;

    const messageKey: Record<FollowAction, string> = {
      FOLLOWED: 'follow.success.nowFollowing',
      REQUEST_SENT: 'follow.success.requestSent',
      UNFOLLOWED: 'follow.success.unfollowed',
      REQUEST_CANCELLED: 'follow.success.requestCancelled',
    };

    const message = String(i18n.t(messageKey[action]));
    return ApiResponse.success(follow, message);
  }

  @Patch('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Accept or Reject a follow request' })
  @ApiOkResponse({
    type: FollowResponseDto,
    description: 'Follow status updated successfully',
  })
  async updateFollowStatus(
    @GetUser() user: JwtPayload,
    @Body() dto: UpdateFollowStatusDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<FollowResponseDto>> {
    const result = await this.followService.updateFollowStatus(
      user.userId,
      dto,
    );

    const message =
      dto.status === FollowStatus.ACCEPTED
        ? i18n.t('follow.success.followRequestAccepted')
        : i18n.t('follow.success.followRequestRejected');

    return ApiResponse.success(result, message);
  }

  @Get('followers/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get followers list' })
  @ApiOkResponse({
    description: 'Followers list retrieved successfully',
  })
  async getFollowers(
    @Param('userId') userId: string,
    @Query() queryDto: FollowListDto,
    @GetUser() user: JwtPayload,
    @I18n() i18n: I18nContext,
  ): Promise<
    ApiResponse<{
      items: UserFollowListDto[];
      meta: PaginationMeta;
    }>
  > {
    const followers = await this.followService.getFollowers(
      user.userId,
      userId,
      queryDto,
    );

    return ApiResponse.success(
      followers,
      i18n.t('follow.success.followersRetrieved'),
    );
  }

  @Get('following/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get following list' })
  @ApiOkResponse({
    description: 'Following list retrieved successfully',
  })
  async getFollowing(
    @Param('userId') userId: string,
    @Query() paginationDto: FollowListDto,
    @GetUser() user: JwtPayload,
    @I18n() i18n: I18nContext,
  ): Promise<
    ApiResponse<{
      items: UserFollowListDto[];
      meta: PaginationMeta;
    }>
  > {
    const following = await this.followService.getFollowing(
      user.userId,
      userId,
      paginationDto,
    );

    return ApiResponse.success(
      following,
      i18n.t('follow.success.followingRetrieved'),
    );
  }

  @Get('mutual-friends/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get mutual friends list' })
  @ApiOkResponse({
    description: 'Mutual friends list retrieved successfully',
  })
  async getMutualFriends(
    @Param('userId') userId: string,
    @Query() paginationDto: FollowListDto,
    @GetUser() user: JwtPayload,
    @I18n() i18n: I18nContext,
  ): Promise<
    ApiResponse<{
      items: UserFollowListDto[];
      meta: PaginationMeta;
    }>
  > {
    const mutualFriends = await this.followService.getMutualFriends(
      user.userId,
      userId,
      paginationDto,
    );

    return ApiResponse.success(
      mutualFriends,
      i18n.t('follow.success.mutualFriendsRetrieved'),
    );
  }
}
