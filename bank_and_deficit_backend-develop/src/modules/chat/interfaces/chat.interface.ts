import { MessageType } from 'generated/prisma/enums';
import { PaginationMeta } from 'src/common/interfaces/pagination.interface';

export interface ChatParticipantResponse {
  id: string;
  name: string;
  profileImage: string | null;
}

export interface ConversationResponse {
  id: string;
  isGroup: boolean;
  title: string | null;
  participant: ChatParticipantResponse | null;
  lastMessage: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  unreadCount: number;
}

export interface ConversationListResponse {
  conversations: ConversationResponse[];
  pagination: PaginationMeta;
  totalUnreadCount?: number;
}

export interface MessageAttachmentResponse {
  id: string;
  type: MessageType;
  fileName: string;
  mediaUrl: string;
  mimeType: string | null;
  size: number | null;
  createdAt: Date;
}

export interface MessageResponse {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string | null;
  createdAt: Date;
  isRead?: boolean;
  attachment?: MessageAttachmentResponse;
}

export interface MessageListResponse {
  messages: MessageResponse[];
  pagination: PaginationMeta;
}

export interface CreateChatResponse {
  conversation: ConversationResponse;
}

export interface PresignedUrlResponse {
  url: string;
  key: string;
  expiresIn: number;
  fileName: string;
}

export interface UserPresenceResponse {
  userId: string;
  isOnline: boolean;
  lastSeenAt: Date | null;
}
