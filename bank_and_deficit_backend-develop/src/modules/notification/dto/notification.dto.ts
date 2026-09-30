import { NotificationType } from 'generated/prisma/enums';
import { PaginationDto } from 'src/common/common.exports';

export class GetNotificationsDto extends PaginationDto {}

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  actorId?: string | null;
  postId?: string | null;
}

export interface UpsertNotificationInput extends CreateNotificationInput {
  upsertKey: {
    userId: string;
    actorId?: string | null;
    postId?: string | null;
    type: NotificationType;
  };
}
