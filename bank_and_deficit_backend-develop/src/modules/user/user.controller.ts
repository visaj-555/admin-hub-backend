import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Query,
  Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiOkResponse,
  ApiBearerAuth,
  ApiTags,
} from '@nestjs/swagger';
import { I18n, I18nContext } from 'nestjs-i18n';
import {
  ApiResponse,
  BadRequestException,
  PaginationDto,
} from 'src/common/common.exports';
import { GetUser } from 'src/common/decorators/get-user';
import type { JwtPayload } from 'src/modules/auth/interfaces/auth.interface';
import { JwtAuthGuard } from 'src/modules/auth/guards/auth.guard';
import { UserService } from './user.service';
import { GetUserProfileDto, UpdateProfileDto } from './dto/user.payload.dto';
import {
  PublicUserProfileResponseDto,
  UpdateProfileResponseDto,
} from './dto/user.response.dto';
import { SearchUsersResponseDto } from './dto/search.response.dto';
import { SearchUsersDto } from './dto/search.payload.dto';
import {
  InsightsQueryDto,
  InsightsResponseDto,
} from './dto/insights.response.dto';

@ApiTags('User')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiOkResponse({
    type: PublicUserProfileResponseDto,
    description: 'Profile retrieved successfully',
  })
  async getProfile(
    @GetUser() user: JwtPayload,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<PublicUserProfileResponseDto>> {
    const profile = await this.userService.getProfile(user.userId);
    return ApiResponse.success(profile, i18n.t('user.success.view'));
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update user profile' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateProfileDto })
  @ApiOkResponse({
    type: UpdateProfileResponseDto,
    description: 'Profile updated successfully',
  })
  @UseInterceptors(
    FileInterceptor('profileImage', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024,
      },

      fileFilter: (
        req: unknown,
        file: Express.Multer.File,
        cb: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        const allowedMimeTypes = [
          'image/jpg',
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/pjpeg',
          'image/heic',
          'image/heif',
          'image/x-heic',
          'image/x-heif',
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
          return cb(
            new BadRequestException(
              'INVALID_IMAGE_FORMAT',
              'user.errors.invalid_image_format',
            ),
            false,
          );
        }

        cb(null, true);
      },
    }),
  )
  async updateProfile(
    @GetUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<UpdateProfileResponseDto>> {
    const updated = await this.userService.updateProfile(
      user.authId,
      dto,
      file,
    );

    return ApiResponse.success(updated, i18n.t('user.success.update'));
  }

  @Get('search')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Search users by name' })
  @ApiOkResponse({
    type: SearchUsersResponseDto,
    description: 'Users retrieved successfully',
  })
  async searchUsers(
    @GetUser() user: JwtPayload,
    @Query() dto: SearchUsersDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<SearchUsersResponseDto>> {
    const result = await this.userService.searchUsers(user.authId, dto);
    return ApiResponse.success(result, i18n.t('user.success.searchResults'));
  }

  @Get('insights')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: "Get user insights, streaks, today's goodness and weekly progress",
  })
  @ApiOkResponse({
    type: InsightsResponseDto,
    description: 'Insights retrieved successfully',
  })
  async getInsights(
    @GetUser() user: JwtPayload,
    @Query() query: InsightsQueryDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<InsightsResponseDto>> {
    const insights = await this.userService.getInsights(
      user.authId,
      query.week,
    );
    return ApiResponse.success(
      insights,
      i18n.t('user.success.insightsRetrieved'),
    );
  }

  @Get('recommendations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get recommended users (my followers first, then public accounts)',
  })
  @ApiOkResponse({
    type: SearchUsersResponseDto,
    description: 'Recommendations retrieved successfully',
  })
  async getRecommendations(
    @GetUser() user: JwtPayload,
    @Query() dto: PaginationDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<SearchUsersResponseDto>> {
    const result = await this.userService.getRecommendations(user.authId, dto);
    return ApiResponse.success(result, i18n.t('user.success.searchResults'));
  }

  @Get(':userId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get public user profile',
  })
  @ApiOkResponse({
    type: PublicUserProfileResponseDto,
  })
  async getUserProfile(
    @GetUser() user: JwtPayload,
    @Param() dto: GetUserProfileDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<PublicUserProfileResponseDto>> {
    const response = await this.userService.getUserProfile(
      user.userId,
      dto.userId,
    );

    return ApiResponse.success(response, i18n.t('user.success.view'));
  }
}
