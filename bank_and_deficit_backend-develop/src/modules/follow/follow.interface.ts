import { Follow } from 'generated/prisma/client';

// In your types/dto file
export type FollowAction =
  | 'FOLLOWED'
  | 'REQUEST_SENT'
  | 'UNFOLLOWED'
  | 'REQUEST_CANCELLED';

export interface ToggleFollowResult {
  action: FollowAction;
  isPrivate: boolean;
  follow: Follow | null;
}
