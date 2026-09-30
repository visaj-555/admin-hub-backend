import { Injectable, Logger } from '@nestjs/common';
import { BadRequestException, ForbiddenException } from 'src/common/exceptions';
import { PrismaService } from 'src/common/database/prisma.service';
import {
  calculatePaginationMeta,
  getPaginationParams,
  PaginationDto,
} from 'src/common/common.exports';
import { S3Service } from 'src/common/aws/s3.service';
import { extname } from 'path';
import * as uuid from 'uuid';
import { CHAT_CONFIG } from './chat.config';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import {
  GenerateChatPresignedUrlDto,
  QueryConversationDto,
} from './dto/chat.dto';
import { SendMessageDto } from './dto/message.dto';
import {
  ConversationListResponse,
  ConversationResponse,
  MessageListResponse,
  UserPresenceResponse,
} from './interfaces/chat.interface';
import { MessageType } from 'generated/prisma/enums';
import { RedisService } from '../redis/redis.service';

type ChatConfigType = typeof CHAT_CONFIG.IMAGE;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly wsClient: ApiGatewayManagementApiClient | null;
  private readonly WS_TTL = 86400; // 24h in seconds

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly redis: RedisService,
  ) {
    const wsEndpoint = process.env.WEBSOCKET_API_ENDPOINT;
    if (wsEndpoint) {
      this.wsClient = new ApiGatewayManagementApiClient({
        endpoint: wsEndpoint,
        region: process.env.AWS_REGION ?? 'us-east-1',
      });
    } else {
      this.logger.warn(
        'WEBSOCKET_API_ENDPOINT not configured, real-time message broadcasting disabled',
      );
      this.wsClient = null;
    }
  }

  private connKey(connectionId: string): string {
    return `ws:conn:${connectionId}`;
  }

  private userKey(userId: string): string {
    return `ws:user:${userId}`;
  }

  private presenceKey(userId: string): string {
    return `presence:${userId}`;
  }

  // ============== CREATE CHAT ============== //

  async createChat(
    userId: string,
    receiveruserId: string,
  ): Promise<ConversationResponse> {
    if (userId === receiveruserId) {
      throw new BadRequestException(
        'CANNOT_CHAT_WITH_SELF',
        'chat.errors.cannotChatWithSelf',
      );
    }

    // ---- CHECK EXISTING 1-1 CONVERSATION ---- //
    const existing = await this.prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: receiveruserId } } },
        ],
      },
      include: {
        members: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (existing) {
      const existingMemberIds = existing.members.map((m) => m.userId);
      const missingMembers: Array<{ userId: string }> = [];

      if (!existingMemberIds.includes(userId)) {
        missingMembers.push({ userId });
      }
      if (!existingMemberIds.includes(receiveruserId)) {
        missingMembers.push({ userId: receiveruserId });
      }

      if (missingMembers.length > 0) {
        await this.prisma.conversationMember.createMany({
          data: missingMembers.map((m) => ({
            conversationId: existing.id,
            userId: m.userId,
          })),
          skipDuplicates: true,
        });

        const updated = await this.prisma.conversation.findUnique({
          where: { id: existing.id },
          include: {
            members: true,
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        });

        if (updated) {
          const otherMember = updated.members.find((m) => m.userId !== userId);
          const participantProfile = otherMember
            ? await this.getProfileData(otherMember.userId)
            : null;

          const lastMessage = updated.messages[0] ?? null;

          const {
            members: _members,
            messages: _messages,
            ...convData
          } = updated;
          return {
            ...convData,
            participant: participantProfile,
            lastMessage: lastMessage
              ? this.getLastMessagePreview(
                  lastMessage.type,
                  lastMessage.content,
                  null,
                )
              : null,
            lastMessageAt: lastMessage?.createdAt ?? null,
            unreadCount: 0,
          };
        }
      }

      const otherMember = existing.members.find((m) => m.userId !== userId);
      const participantProfile = otherMember
        ? await this.getProfileData(otherMember.userId)
        : null;

      const lastMessage = existing.messages[0] ?? null;

      const { members: _members, messages: _messages, ...convData } = existing;
      return {
        ...convData,
        participant: participantProfile,
        lastMessage: lastMessage
          ? this.getLastMessagePreview(
              lastMessage.type,
              lastMessage.content,
              null,
            )
          : null,
        lastMessageAt: lastMessage?.createdAt ?? null,
        unreadCount: 0,
      };
    }

    const newConversation = await this.prisma.conversation.create({
      data: {
        isGroup: false,
        members: {
          createMany: {
            data: [{ userId }, { userId: receiveruserId }],
          },
        },
      },
      include: {
        members: true,
      },
    });

    const otherMember = newConversation.members.find(
      (m) => m.userId !== userId,
    );
    const participantProfile = otherMember
      ? await this.getProfileData(otherMember.userId)
      : null;

    const { members: _members, ...convData } = newConversation;
    return {
      ...convData,
      participant: participantProfile,
      lastMessage: null,
      lastMessageAt: null,
      unreadCount: 0,
    };
  }

  // ============== FIND CONVERSATION BY RECEIVER ID ============== //

  async findConversationIdByReceiverId(
    userId: string,
    receiverId: string,
  ): Promise<string | null> {
    if (userId === receiverId) {
      throw new BadRequestException(
        'CANNOT_CHAT_WITH_SELF',
        'chat.errors.cannotChatWithSelf',
      );
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: receiverId } } },
        ],
      },
      select: { id: true },
    });

    return conversation?.id ?? null;
  }

  // ============== FETCH SINGLE CONVERSATION WITH LAST MESSAGE ============== //

  async getConversationById(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        members: {
          some: { userId },
        },
      },
      include: {
        members: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!conversation) {
      throw new ForbiddenException(
        'NOT_PARTICIPANT',
        'chat.errors.notParticipant',
      );
    }

    const memberIds = conversation.members.map((m) => m.userId);
    const [userAId, userBId] = memberIds;

    const member = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId },
    });

    const unreadCount = await this.prisma.message.count({
      where: {
        conversationId,
        senderId: { not: userId },
        createdAt: { gt: member?.lastReadAt ?? new Date(0) },
      },
    });

    const lastMessage = conversation.messages[0] ?? null;

    const {
      members: _members,
      messages: _messages,
      ...convData
    } = conversation;
    return {
      ...convData,
      userAId: userAId ?? '',
      userBId: userBId ?? '',
      lastMessageAt: lastMessage?.createdAt ?? null,
      lastMessage: lastMessage
        ? this.getLastMessagePreview(
            lastMessage.type,
            lastMessage.content,
            null,
          )
        : null,
      unreadCount,
    };
  }

  // ============== FETCH ALL CONVERSATIONS ============== //

  async getAllConversations(
    userId: string,
    query: QueryConversationDto,
  ): Promise<ConversationListResponse> {
    const { page, limit, skip } = getPaginationParams(query);
    const searchTerm = query.search?.trim() ?? '';

    const where = {
      members: {
        some: { userId },
      },
    };

    const [conversations, _total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: {
          members: true,
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    const mapped = await Promise.all(
      conversations.map(async (conversation) => {
        const otherMember = conversation.isGroup
          ? null
          : conversation.members.find((m) => m.userId !== userId);

        const participantProfile = otherMember
          ? await this.getProfileData(otherMember.userId)
          : null;

        const member = await this.prisma.conversationMember.findFirst({
          where: { conversationId: conversation.id, userId },
        });

        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: conversation.id,
            senderId: { not: userId },
            createdAt: { gt: member?.lastReadAt ?? new Date(0) },
          },
        });

        const lastMessage = conversation.messages[0] ?? null;

        const {
          members: _members,
          messages: _messages,
          ...convData
        } = conversation;
        return {
          ...convData,
          participant: participantProfile,
          lastMessage: lastMessage
            ? this.getLastMessagePreview(
                lastMessage.type,
                lastMessage.content,
                null,
              )
            : null,
          lastMessageAt: lastMessage?.createdAt ?? null,
          unreadCount,
        };
      }),
    );

    const filteredConversations = searchTerm
      ? mapped.filter((conversation) => {
          const participantName = conversation.participant?.name ?? '';
          const title = conversation.title ?? '';
          const haystack = `${participantName} ${title}`.toLowerCase();
          return haystack.includes(searchTerm.toLowerCase());
        })
      : mapped;

    const totalFiltered = filteredConversations.length;
    const totalUnreadCount = filteredConversations.reduce(
      (sum, conversation) => sum + conversation.unreadCount,
      0,
    );
    const paginatedConversations = filteredConversations.slice(
      skip,
      skip + limit,
    );

    return {
      conversations: paginatedConversations,
      pagination: calculatePaginationMeta(totalFiltered, page, limit),
      totalUnreadCount,
    };
  }

  // ============== LAST MESSAGE PREVIEW (HELPER) ============== //

  private getLastMessagePreview(
    type: MessageType,
    content: string | null,
    attachment?: {
      type: MessageType;
      fileName: string | null;
    } | null,
  ): string {
    if (attachment) {
      switch (attachment.type) {
        case MessageType.IMAGE:
          return 'Photo';
        default:
          return content ?? '';
      }
    }

    switch (type) {
      case MessageType.TEXT:
        return content ?? '';
      case MessageType.IMAGE:
        return 'Sent an image';
      default:
        return content ?? '';
    }
  }

  // ============== GET PROFILE DATA (HELPER) ============== //

  private async getProfileData(userId: string): Promise<{
    id: string;
    name: string;
    profileImage: string | null;
  } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        profileImage: true,
      },
    });

    if (!user) {
      return null;
    }

    const profileImage = user.profileImage
      ? await this.s3Service.getSignedUrl(user.profileImage)
      : null;

    return {
      id: user.id,
      name: `${user.firstName} ${user.lastName}`.trim(),
      profileImage,
    };
  }

  // ============== GENERATE PRE SIGNED URL FOR CHAT ============== //

  async generateChatPresignedUrl(
    userId: string,
    dto: GenerateChatPresignedUrlDto,
  ) {
    const isParticipant = await this.prisma.conversationMember.findFirst({
      where: {
        conversationId: dto.conversationId,
        userId,
      },
    });

    if (!isParticipant) {
      throw new ForbiddenException(
        'NOT_PARTICIPANT',
        'chat.errors.notParticipant',
      );
    }

    let config: ChatConfigType;
    switch (dto.type) {
      case MessageType.IMAGE: {
        config = CHAT_CONFIG.IMAGE;

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const sentImagesCount = await this.prisma.message.count({
          where: {
            senderId: userId,
            type: MessageType.IMAGE,
            createdAt: {
              gte: startOfDay,
            },
          },
        });

        if (sentImagesCount >= CHAT_CONFIG.IMAGE.DAILY_LIMIT) {
          throw new BadRequestException(
            'DAILY_IMAGE_LIMIT_EXCEEDED',
            'chat.errors.dailyImageLimitExceeded',
            { limit: CHAT_CONFIG.IMAGE.DAILY_LIMIT },
          );
        }
        break;
      }
      default:
        throw new BadRequestException(
          'INVALID_MESSAGE_TYPE',
          'chat.errors.invalidMessageType',
        );
    }

    if (dto.fileSize > config.MAX_SIZE_BYTES) {
      throw new BadRequestException(
        'FILE_SIZE_EXCEEDED',
        'chat.errors.fileSizeExceeded',
        { maxSize: config.MAX_SIZE_MB },
      );
    }

    const extension = extname(dto.fileName).toLowerCase();
    if (!(config.ALLOWED_EXTENSIONS as readonly string[]).includes(extension)) {
      throw new BadRequestException(
        'INVALID_FILE_TYPE',
        'chat.errors.invalidFileType',
        {
          fileExtension: extension,
          allowed: config.ALLOWED_EXTENSIONS.join(', '),
        },
      );
    }

    const uniqueFileName = `${uuid.v4()}${extension}`;
    const folder = `chat/${dto.conversationId}`;

    const { url, key } = await this.s3Service.generatePresignedUrl(
      folder,
      uniqueFileName,
      config.ALLOWED_TYPES[0],
      config.ALLOWED_EXTENSIONS,
      config.ALLOWED_TYPES,
    );

    return {
      url,
      key,
      expiresIn: CHAT_CONFIG.PRESIGNED_URL_EXPIRATION,
      fileName: uniqueFileName,
    };
  }

  // ============== GET ALL MESSAGES ============== //

  async getMessages(
    userId: string,
    conversationId: string,
    query: PaginationDto,
  ): Promise<MessageListResponse> {
    const { page, limit, skip } = getPaginationParams(query);

    const member = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId },
    });

    if (!member) {
      throw new ForbiddenException(
        'NOT_PARTICIPANT',
        'chat.errors.notParticipant',
      );
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { members: true },
    });

    const otherParticipant = conversation?.members.find(
      (m) => m.userId !== userId,
    );
    const otherParticipantId = otherParticipant?.userId;

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId },
        include: {
          reads: otherParticipantId
            ? {
                where: { userId: otherParticipantId },
              }
            : undefined,
          attachment: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.message.count({
        where: { conversationId },
      }),
    ]);

    const messagesWithSignedUrls = await Promise.all(
      messages.map(async (message) => {
        const isRead: boolean | undefined =
          message.senderId === userId
            ? Boolean(
                otherParticipantId &&
                message.reads &&
                Array.isArray(message.reads) &&
                message.reads.length > 0,
              )
            : undefined;

        const rawAttachment = message.attachment ?? null;

        let attachmentSignedUrl: string | null = null;

        if (rawAttachment?.mediaUrl) {
          attachmentSignedUrl =
            (await this.s3Service.getSignedUrl(
              rawAttachment.mediaUrl,
              undefined,
              86400,
            )) ?? null;
        }

        const finalAttachment = rawAttachment
          ? {
              ...rawAttachment,
              mediaUrl: attachmentSignedUrl ?? rawAttachment.mediaUrl ?? '',
            }
          : undefined;

        const { attachment: _removedAttachment, ...messageRest } = message;

        return {
          ...messageRest,
          ...(message.senderId === userId && isRead !== undefined
            ? { isRead }
            : {}),
          ...(finalAttachment ? { attachment: finalAttachment } : {}),
        };
      }),
    );

    return {
      messages: messagesWithSignedUrls,
      pagination: calculatePaginationMeta(total, page, limit),
    };
  }

  // ============== SEND MESSAGE ============== //

  async sendMessage(userId: string, dto: SendMessageDto) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: dto.conversationId },
      include: { members: true },
    });

    let finalConversationId = dto.conversationId;

    if (
      !conversation ||
      !conversation.members.some((m) => m.userId === userId)
    ) {
      const receiverId = dto.receiverId ?? dto.conversationId;

      if (receiverId && receiverId !== userId) {
        const createdConversation = await this.createChat(userId, receiverId);
        finalConversationId = createdConversation.id;
      } else {
        throw new ForbiddenException(
          'NOT_PARTICIPANT',
          'chat.errors.notParticipant',
        );
      }
    }

    const attachmentsPayload = dto.attachment
      ? [dto.attachment]
      : dto.mediaUrl
        ? [
            {
              type: dto.type,
              fileName: dto.fileName ?? 'file',
              mediaUrl: dto.mediaUrl,
              mimeType: dto.mimeType,
              size: dto.size,
            },
          ]
        : [];

    if (attachmentsPayload.length > 0) {
      this.validateAttachmentsAgainstConfig(attachmentsPayload);
      await this.assertImageAttachmentsIntegrity(attachmentsPayload);
    }

    const primaryType =
      attachmentsPayload.length > 0 ? attachmentsPayload[0].type : dto.type;

    const hasImage =
      attachmentsPayload.some((a) => a.type === MessageType.IMAGE) ||
      primaryType === MessageType.IMAGE;

    if (hasImage) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const sentImagesCount = await this.prisma.message.count({
        where: {
          senderId: userId,
          type: MessageType.IMAGE,
          createdAt: {
            gte: startOfDay,
          },
        },
      });

      if (sentImagesCount >= CHAT_CONFIG.IMAGE.DAILY_LIMIT) {
        throw new BadRequestException(
          'DAILY_IMAGE_LIMIT_EXCEEDED',
          'chat.errors.dailyImageLimitExceeded',
          { limit: CHAT_CONFIG.IMAGE.DAILY_LIMIT },
        );
      }
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId: finalConversationId,
        senderId: userId,
        type: primaryType,
        content: dto.content,
      },
    });

    if (attachmentsPayload.length > 0) {
      await this.prisma.messageAttachment.createMany({
        data: attachmentsPayload.map((attachment) => ({
          messageId: message.id,
          type: attachment.type,
          fileName: attachment.fileName,
          mediaUrl: attachment.mediaUrl,
          mimeType: attachment.mimeType,
          size: attachment.size,
        })),
      });
    }

    await this.prisma.conversation.update({
      where: { id: finalConversationId },
      data: { updatedAt: new Date() },
    });

    await this.broadcastMessage(finalConversationId, message.id, userId);

    const fullMessage = await this.prisma.message.findUnique({
      where: { id: message.id },
      include: { attachment: true },
    });

    if (!fullMessage) {
      return {
        ...message,
        conversationId: finalConversationId,
      };
    }

    const rawAttachment = fullMessage.attachment ?? null;

    let attachmentSignedUrl: string | null = null;

    if (rawAttachment?.mediaUrl) {
      attachmentSignedUrl =
        (await this.s3Service.getSignedUrl(
          rawAttachment.mediaUrl,
          undefined,
          86400,
        )) ?? null;
    }

    const finalAttachment = rawAttachment
      ? {
          ...rawAttachment,
          mediaUrl: attachmentSignedUrl ?? rawAttachment.mediaUrl ?? '',
        }
      : undefined;

    const { attachment: _removedAttachment, ...fullMessageRest } = fullMessage;

    return {
      ...fullMessageRest,
      conversationId: finalConversationId,
      fileName: null,
      mediaUrl: null,
      mimeType: null,
      size: null,
      ...(finalAttachment ? { attachment: finalAttachment } : {}),
    };
  }

  // ============== BROADCAST MESSAGE VIA WEBSOCKET ============== //

  private async broadcastMessage(
    conversationId: string,
    messageId: string,
    _senderId: string,
  ): Promise<void> {
    const client = this.wsClient;
    if (!client) {
      return;
    }

    try {
      const conversationMembers = await this.prisma.conversationMember.findMany(
        {
          where: { conversationId },
          select: { userId: true },
        },
      );

      if (conversationMembers.length === 0) {
        return;
      }

      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        include: { attachment: true },
      });

      if (!message) {
        return;
      }

      let finalAttachment = message.attachment ?? null;
      if (finalAttachment && finalAttachment.mediaUrl) {
        const attachmentSignedUrl = await this.s3Service.getSignedUrl(
          finalAttachment.mediaUrl,
          undefined,
          86400,
        );
        finalAttachment = {
          ...finalAttachment,
          mediaUrl: attachmentSignedUrl ?? finalAttachment.mediaUrl ?? '',
        };
      }

      const { attachment: _removed, ...messageRest } = message;
      const messageData = {
        ...messageRest,
        ...(finalAttachment ? { attachment: finalAttachment } : {}),
      };

      const broadcastPromises = conversationMembers.map(async (member) => {
        const connectionIds = await this.redis.smembers(
          this.userKey(member.userId),
        );
        const connections = connectionIds.map((id) => ({ connectionId: id }));

        if (connections.length === 0) {
          return;
        }

        const sendPromises = connections.map((conn) =>
          client
            .send(
              new PostToConnectionCommand({
                ConnectionId: conn.connectionId,
                Data: JSON.stringify({
                  type: 'message',
                  data: messageData,
                }),
              }),
            )
            .catch((error) => {
              this.logger.debug(
                `Failed to broadcast to connection ${conn.connectionId}: ${error instanceof Error ? error.message : 'Unknown'}`,
              );
            }),
        );

        await Promise.allSettled(sendPromises);
        this.logger.log(
          `Broadcasting to ${connections.length} connection(s) for recipient ${member.userId}`,
        );
      });

      await Promise.allSettled(broadcastPromises);
      this.logger.log(
        `Successfully broadcast to all connection(s) for conversation ${conversationId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to broadcast message: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // ============== ATTACHMENT VALIDATION ============== //

  private async assertImageAttachmentsIntegrity(
    attachments: Array<{
      type: MessageType;
      fileName: string | null;
      mediaUrl: string;
    }>,
  ): Promise<void> {
    for (const attachment of attachments) {
      if (attachment.type !== MessageType.IMAGE) {
        continue;
      }

      const key = attachment.mediaUrl.replace(/\/+/g, '/');
      const fileExtension =
        extname(attachment.fileName ?? '').toLowerCase() ||
        extname(attachment.mediaUrl).toLowerCase();
      const fileBuffer = await this.s3Service.getFileBuffer(key);

      try {
        this.s3Service.validateImageIntegrity(fileBuffer, fileExtension);
      } catch (error) {
        if (this.isCorruptImageError(error)) {
          await this.s3Service.deleteObjectByKey(key).catch((deleteError) => {
            this.logger.warn(
              `Failed to delete corrupt chat image ${key}: ${
                deleteError instanceof Error
                  ? deleteError.message
                  : String(deleteError)
              }`,
            );
          });
        }
        throw error;
      }
    }
  }

  private isCorruptImageError(error: unknown): boolean {
    return (
      error instanceof BadRequestException &&
      error.errorCode === 'CORRUPT_IMAGE'
    );
  }

  private validateAttachmentsAgainstConfig(
    attachments: Array<{
      type: MessageType;
      fileName: string | null;
      mediaUrl: string;
      mimeType?: string | null;
      size?: number | null;
    }>,
  ): void {
    const typeToConfig: Partial<Record<MessageType, ChatConfigType>> = {
      [MessageType.IMAGE]: CHAT_CONFIG.IMAGE,
    };

    const attachmentCounts: Partial<Record<MessageType, number>> = {};

    for (const attachment of attachments) {
      const config = typeToConfig[attachment.type];

      if (!config) {
        continue;
      }

      attachmentCounts[attachment.type] =
        (attachmentCounts[attachment.type] ?? 0) + 1;
      if ((attachmentCounts[attachment.type] ?? 0) > config.MAX_COUNT) {
        throw new BadRequestException(
          'ATTACHMENT_LIMIT_EXCEEDED',
          'chat.errors.attachmentLimitExceeded',
          {
            type: attachment.type,
            maxCount: config.MAX_COUNT,
          },
        );
      }

      if (attachment.size != null && attachment.size > config.MAX_SIZE_BYTES) {
        throw new BadRequestException(
          'FILE_SIZE_EXCEEDED',
          'chat.errors.fileSizeExceeded',
          { maxSize: config.MAX_SIZE_MB },
        );
      }

      if (attachment.fileName) {
        const extension = extname(attachment.fileName).toLowerCase();
        if (
          extension &&
          !(config.ALLOWED_EXTENSIONS as readonly string[]).includes(extension)
        ) {
          throw new BadRequestException(
            'INVALID_FILE_TYPE',
            'chat.errors.invalidFileType',
            {
              fileExtension: extension,
              allowed: config.ALLOWED_EXTENSIONS.join(', '),
            },
          );
        }
      }

      const allowedMimeTypes = config.ALLOWED_TYPES as readonly string[];
      if (
        attachment.mimeType &&
        !allowedMimeTypes.includes(attachment.mimeType)
      ) {
        throw new BadRequestException(
          'INVALID_FILE_TYPE',
          'chat.errors.invalidFileType',
          {
            mimeType: attachment.mimeType,
            allowed: config.ALLOWED_TYPES.join(', '),
          },
        );
      }
    }
  }

  // ============== MARK CONVERSATION AS READ ============== //

  async markConversationAsRead(userId: string, conversationId: string) {
    const member = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId },
    });

    if (!member) {
      throw new ForbiddenException(
        'NOT_PARTICIPANT',
        'chat.errors.notParticipant',
      );
    }

    const now = new Date();

    await this.prisma.conversationMember.update({
      where: { id: member.id },
      data: { lastReadAt: now },
    });

    const unreadMessages = await this.prisma.message.findMany({
      where: {
        conversationId,
        senderId: { not: userId },
        createdAt: { gt: member.lastReadAt ?? new Date(0) },
      },
      select: { id: true },
    });

    if (unreadMessages.length) {
      await this.prisma.messageRead.createMany({
        data: unreadMessages.map((m) => ({
          messageId: m.id,
          userId,
          readAt: now,
        })),
        skipDuplicates: true,
      });
    }

    return {
      success: true,
      readMessageIds: unreadMessages.map((m) => m.id),
    };
  }

  // ============== MARK PRESENCE AS ONLINE ============== //

  async setPresenceOnline(userId: string): Promise<void> {
    await this.redis.set(
      this.presenceKey(userId),
      JSON.stringify({ isOnline: true, lastSeenAt: null }),
    );
  }

  // ============== MARK PRESENCE AS OFFLINE ============== //

  async setPresenceOffline(userId: string): Promise<void> {
    const activeCount = await this.redis.scard(this.userKey(userId));

    if (activeCount > 0) {
      this.logger.debug(
        `User ${userId} still has ${activeCount} active connection(s), keeping online status.`,
      );
      return;
    }

    await this.redis.set(
      this.presenceKey(userId),
      JSON.stringify({ isOnline: false, lastSeenAt: new Date().toISOString() }),
    );
  }

  // ============== VIEW PRESENCE OF USER ============== //

  async getPresence(userId: string): Promise<UserPresenceResponse | null> {
    const raw = await this.redis.get(this.presenceKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      isOnline: boolean;
      lastSeenAt: string | null;
    };

    return {
      userId,
      isOnline: parsed.isOnline,
      lastSeenAt: parsed.lastSeenAt ? new Date(parsed.lastSeenAt) : null,
    };
  }

  // ============== GET S3 SIGNED URL FOR CHAT MEDIA ============== //

  async getSignedUrlForMedia(mediaUrl: string): Promise<string | null> {
    if (!mediaUrl) {
      return null;
    }

    return this.s3Service.getSignedUrl(mediaUrl, undefined, 86400);
  }

  // ============== STORE WEBSOCKET CONNECTION ============== //

  async storeWebSocketConnection(
    connectionId: string,
    userId: string,
    _token?: string,
  ) {
    const normalized = connectionId.trim();

    await Promise.all([
      this.redis.set(this.connKey(normalized), userId, this.WS_TTL),
      this.redis.sadd(this.userKey(userId), normalized),
      this.redis.expire(this.userKey(userId), this.WS_TTL),
    ]);

    return { connectionId: normalized, userId };
  }

  // ============== VIEW WEBSOCKET CONNECTION ============== //

  async getWebSocketConnection(connectionId: string) {
    const normalized = connectionId.trim();
    const userId = await this.redis.get(this.connKey(normalized));
    if (!userId) return null;
    return { connectionId: normalized, userId };
  }

  // ============== REMOVE WEBSOCKET CONNECTION ============== //

  async deleteWebSocketConnection(connectionId: string) {
    const normalized = connectionId.trim();
    const userId = await this.redis.get(this.connKey(normalized));

    await this.redis.del(this.connKey(normalized));

    if (userId) {
      await this.redis.srem(this.userKey(userId), normalized);
    }

    return null;
  }

  // ============== VIEW ALL WEBSOCKET CONNECTIONS ============== //

  async getUserWebSocketConnections(userId: string) {
    const ids = await this.redis.smembers(this.userKey(userId));
    return ids.map((connectionId) => ({ connectionId, userId }));
  }
}
