import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  UseGuards,
  Query,
  Body,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { ReminderScheduleService } from 'src/common/reminder/reminder-schedule.service';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { GetUser } from 'src/common/decorators/get-user';
import { I18n, I18nContext } from 'nestjs-i18n';
import { ApiResponse } from 'src/common/common.exports';
import { GetNotificationsDto } from './dto/notification.dto';
import { NotificationListResponseDto } from './dto/notification.response.dto';
import { RegisterDeviceTokenDto } from './dto/device-token.dto';
import type { JwtPayload } from 'src/modules/auth/interfaces/auth.interface';

@ApiTags('Notifications')
@Controller('notification')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly reminderScheduleService: ReminderScheduleService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get notifications' })
  @ApiOkResponse({
    type: NotificationListResponseDto,
    description: 'Notifications fetched successfully',
  })
  async getNotifications(
    @GetUser() user: JwtPayload,
    @Query() dto: GetNotificationsDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<NotificationListResponseDto>> {
    const result = await this.notificationService.getNotifications(
      user.userId,
      dto.page,
      dto.limit,
    );

    return ApiResponse.success(
      result, // ← This should now match the DTO
      i18n.t('notification.success.fetched'),
    );
  }

  @Patch('read-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiOkResponse({
    description: 'All notifications marked as read',
    schema: {
      allOf: [{ $ref: getSchemaPath(ApiResponse) }],
    },
  })
  async markAllAsRead(
    @GetUser() user: JwtPayload,
    @I18n() i18n?: I18nContext,
  ): Promise<ApiResponse<null>> {
    await this.notificationService.markAllAsRead(user.userId);

    return ApiResponse.success(
      null,
      i18n?.t('notification.success.allMarkedAsRead'),
    );
  }

  @Post('token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Register a device FCM token and Timezone' })
  @ApiOkResponse({
    description: 'Device token registered successfully',
  })
  async registerDeviceToken(
    @GetUser() user: JwtPayload,
    @Body() dto: RegisterDeviceTokenDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<null>> {
    await this.notificationService.registerDeviceToken(
      user.userId,
      dto.token,
      dto.timezone,
    );
    await this.reminderScheduleService.ensureUserSchedules(
      user.userId,
      dto.timezone,
    );
    return ApiResponse.success(
      null,
      i18n.t('notification.success.deviceTokenRegistered'),
    );
  }

  @Delete('token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Unregister a device FCM token' })
  @ApiOkResponse({
    description: 'Device token unregistered successfully',
  })
  async unregisterDeviceToken(
    @GetUser() user: JwtPayload,
    @Body() dto: RegisterDeviceTokenDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<null>> {
    await this.notificationService.unregisterDeviceToken(
      user.userId,
      dto.token,
    );
    return ApiResponse.success(
      null,
      i18n.t('notification.success.deviceTokenUnregistered'),
    );
  }
}
