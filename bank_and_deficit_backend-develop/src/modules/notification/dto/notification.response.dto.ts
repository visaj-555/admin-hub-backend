import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from 'generated/prisma/enums';
import { PaginationMetaDto } from 'src/common/common.exports';

export class NotificationActorDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  fullName: string;

  @ApiPropertyOptional({ nullable: true })
  profileImage?: string | null;
}

export class NotificationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: NotificationType })
  type: NotificationType;

  @ApiPropertyOptional({ nullable: true })
  title?: string | null;

  @ApiPropertyOptional({ nullable: true })
  message?: string | null;

  @ApiPropertyOptional({ nullable: true })
  postId?: string | null;

  @ApiProperty()
  isRead: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({
    type: NotificationActorDto,
    nullable: true,
  })
  actor?: NotificationActorDto | null;
}

export class NotificationListResponseDto {
  @ApiProperty({
    type: [NotificationResponseDto],
  })
  notifications: NotificationResponseDto[];

  @ApiProperty()
  meta: PaginationMetaDto;

  @ApiProperty({
    description: 'Total number of unread notifications for the user',
  })
  totalUnreadCount: number;
}
