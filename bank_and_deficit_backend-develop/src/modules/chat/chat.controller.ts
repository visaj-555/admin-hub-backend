import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Query,
  Param,
  UseGuards,
  Delete,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiQuery,
  ApiParam,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { ChatService } from './chat.service';
import { GetUser } from 'src/common/decorators/get-user';
import { Public } from 'src/common/decorators/public.decorator';
import { I18n, I18nContext } from 'nestjs-i18n';
import { ApiResponse } from 'src/common/common.exports';
import { BadRequestException } from 'src/common/exceptions';
import {
  CreateChatDto,
  QueryConversationDto,
  GenerateChatPresignedUrlDto,
  GetConversationByReceiverDto,
} from './dto/chat.dto';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { SendMessageDto } from './dto/message.dto';
import {
  CreateChatResponse,
  ConversationListResponse,
  MessageListResponse,
  PresignedUrlResponse,
  UserPresenceResponse,
} from './interfaces/chat.interface';
import type { JwtPayload } from 'src/modules/auth/interfaces/auth.interface';

@ApiTags('Chat')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @ApiExtraModels(ApiResponse, CreateChatDto)
  @Post('create')
  @ApiOperation({ summary: 'Create 1-to-1 chat conversation (for Frontend)' })
  @ApiCreatedResponse({
    description: 'Chat conversation created successfully',
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiResponse) },
        {
          properties: {
            success: { type: 'boolean', example: true },
            statusCode: { type: 'number', example: 201 },
            message: {
              type: 'string',
              example: 'Chat created successfully',
            },
            data: {
              type: 'object',
              properties: {
                conversation: {
                  type: 'object',
                  properties: {
                    id: {
                      type: 'string',
                      example: '019b5947-8486-77df-a8c3-7622c93626be',
                    },
                    isGroup: { type: 'boolean', example: false },
                    title: { type: 'string', nullable: true, example: null },
                    participant: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        userType: {
                          type: 'string',
                          enum: ['USER', 'NGO', 'ORGANIZATION'],
                        },
                        profileImage: { type: 'string', nullable: true },
                      },
                    },
                    lastMessage: { type: 'string', nullable: true },
                    lastMessageAt: {
                      type: 'string',
                      format: 'date-time',
                      nullable: true,
                    },
                    unreadCount: { type: 'number', example: 0 },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      ],
    },
  })
  async createChat(
    @Body() dto: CreateChatDto,
    @GetUser() user: JwtPayload,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<CreateChatResponse>> {
    const conversation = await this.chatService.createChat(
      user.userId,
      dto.receiverId,
    );

    return ApiResponse.created({ conversation }, i18n.t('chat.create.success'));
  }

  @ApiExtraModels(ApiResponse, GetConversationByReceiverDto)
  @Get('conversation-check')
  @ApiOperation({
    summary:
      'Get conversation ID by receiver ID. Returns conversationId if a 1-to-1 conversation exists; otherwise "Conversation not found!"',
  })
  @ApiQuery({
    name: 'receiverId',
    required: true,
    type: String,
    description: 'Auth ID of the receiver',
    example: '019b5947-8486-77df-a8c3-7622c93626be',
  })
  @ApiOkResponse({
    description: 'Conversation ID returned when conversation exists',
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiResponse) },
        {
          properties: {
            success: { type: 'boolean', example: true },
            statusCode: { type: 'number', example: 200 },
            message: { type: 'string', example: 'Conversation found' },
            data: {
              type: 'object',
              properties: {
                conversationId: {
                  type: 'string',
                  nullable: true,
                  example: '019b5947-8486-77df-a8c3-7622c93626be',
                },
              },
            },
          },
        },
      ],
    },
  })
  async getConversationByReceiverId(
    @Query() dto: GetConversationByReceiverDto,
    @GetUser() user: JwtPayload,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<{ conversationId: string | null }>> {
    const conversationId =
      await this.chatService.findConversationIdByReceiverId(
        user.userId,
        dto.receiverId,
      );

    const message = conversationId
      ? i18n.t('chat.conversationFetched.success')
      : 'Conversation not found';

    return ApiResponse.success({ conversationId }, message);
  }

  @ApiExtraModels(ApiResponse)
  @Patch('conversations/read/:id')
  @ApiOperation({ summary: 'Mark conversation as read (for Lambda)' })
  @ApiParam({
    name: 'id',
    description: 'Conversation ID',
    example: '019bc59c-9e7b-74f2-9531-ad699bdcf391',
  })
  @ApiOkResponse({
    description: 'Conversation marked as read',
  })
  async markConversationAsRead(
    @Param('id') conversationId: string,
    @GetUser() user: JwtPayload,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<{ success: boolean }>> {
    await this.chatService.markConversationAsRead(user.userId, conversationId);
    return ApiResponse.success({ success: true }, i18n.t('chat.markedAsRead'));
  }

  @ApiExtraModels(ApiResponse)
  @Get('conversations/:id')
  @ApiOperation({
    summary: 'Get a single conversation by ID (for Lambda)',
  })
  @ApiParam({
    name: 'id',
    description: 'Conversation ID',
    example: '019b5947-8486-77df-a8c3-7622c93626be',
  })
  @ApiOkResponse({
    description: 'Conversation retrieved successfully',
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiResponse) },
        {
          properties: {
            success: { type: 'boolean', example: true },
            statusCode: { type: 'number', example: 200 },
            message: {
              type: 'string',
              example: 'Conversation retrieved successfully',
            },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                userAId: { type: 'string' },
                userBId: { type: 'string' },
                lastMessageAt: {
                  type: 'string',
                  format: 'date-time',
                  nullable: true,
                },
                lastMessage: { type: 'string', nullable: true },
                unreadCount: { type: 'number', example: 0 },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      ],
    },
  })
  async getConversationById(
    @Param('id') conversationId: string,
    @GetUser() user: JwtPayload,
    @I18n() i18n: I18nContext,
  ): Promise<
    ApiResponse<{
      id: string;
      userAId: string;
      userBId: string;
      lastMessageAt: Date | null;
      lastMessage: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>
  > {
    const conversation = await this.chatService.getConversationById(
      user.userId,
      conversationId,
    );
    return ApiResponse.success(
      conversation,
      i18n.t('chat.conversationFetched.success'),
    );
  }

  @ApiExtraModels(ApiResponse, QueryConversationDto)
  @Get('conversations')
  @ApiOperation({
    summary: 'Get all 1-to-1 conversations with pagination (for Frontend)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description:
      'Optional search term to filter conversations by participant name',
    example: 'John',
  })
  @ApiOkResponse({
    description: 'Conversations retrieved successfully',
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiResponse) },
        {
          properties: {
            success: { type: 'boolean', example: true },
            statusCode: { type: 'number', example: 200 },
            message: {
              type: 'string',
              example: 'Conversations fetched',
            },
            data: {
              type: 'object',
              properties: {
                conversations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      isGroup: { type: 'boolean', example: false },
                      title: { type: 'string', nullable: true },
                      participant: {
                        type: 'object',
                        nullable: true,
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          userType: {
                            type: 'string',
                            enum: ['USER', 'NGO', 'ORGANIZATION'],
                          },
                          profileImage: { type: 'string', nullable: true },
                        },
                      },
                      lastMessage: { type: 'string', nullable: true },
                      lastMessageAt: {
                        type: 'string',
                        format: 'date-time',
                        nullable: true,
                      },
                      unreadCount: { type: 'number', example: 0 },
                      createdAt: { type: 'string', format: 'date-time' },
                      updatedAt: { type: 'string', format: 'date-time' },
                    },
                  },
                },
                pagination: {
                  type: 'object',
                  properties: {
                    page: { type: 'number', example: 1 },
                    limit: { type: 'number', example: 20 },
                    total: { type: 'number', example: 10 },
                    totalPages: { type: 'number', example: 1 },
                    hasNextPage: { type: 'boolean', example: false },
                    hasPreviousPage: { type: 'boolean', example: false },
                  },
                },
                totalUnreadCount: {
                  type: 'number',
                  example: 19,
                  description:
                    'Total unread messages across all returned conversations',
                },
              },
            },
          },
        },
      ],
    },
  })
  async getAllConversations(
    @GetUser() user: JwtPayload,
    @Query() query: QueryConversationDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<ConversationListResponse>> {
    const result = await this.chatService.getAllConversations(
      user.userId,
      query,
    );

    return ApiResponse.success(result, i18n.t('chat.fetch'));
  }

  @ApiExtraModels(ApiResponse, PaginationDto)
  @Get('messages/:conversationId')
  @ApiOperation({
    summary: 'Get messages of a conversation with pagination (for Frontend)',
  })
  @ApiParam({
    name: 'conversationId',
    description: 'Conversation ID',
    example: '019b5947-8486-77df-a8c3-7622c93626be',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiOkResponse({
    description: 'Messages retrieved successfully',
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiResponse) },
        {
          properties: {
            success: { type: 'boolean', example: true },
            statusCode: { type: 'number', example: 200 },
            message: {
              type: 'string',
              example: 'Messages fetched',
            },
            data: {
              type: 'object',
              properties: {
                messages: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      conversationId: { type: 'string' },
                      senderId: { type: 'string' },
                      type: {
                        type: 'string',
                        enum: ['TEXT', 'IMAGE', 'VIDEO', 'FILE'],
                      },
                      content: { type: 'string', nullable: true },
                      createdAt: { type: 'string', format: 'date-time' },
                    },
                  },
                },
                pagination: {
                  type: 'object',
                  properties: {
                    page: { type: 'number', example: 1 },
                    limit: { type: 'number', example: 20 },
                    total: { type: 'number', example: 50 },
                    totalPages: { type: 'number', example: 3 },
                    hasNextPage: { type: 'boolean', example: true },
                    hasPreviousPage: { type: 'boolean', example: false },
                  },
                },
              },
            },
          },
        },
      ],
    },
  })
  async getMessages(
    @Param('conversationId') conversationId: string,
    @Query() query: PaginationDto,
    @GetUser() user: JwtPayload,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<MessageListResponse>> {
    const result = await this.chatService.getMessages(
      user.userId,
      conversationId,
      query,
    );

    // Mark conversation as read when user fetches messages
    try {
      await this.chatService.markConversationAsRead(
        user.userId,
        conversationId,
      );
    } catch {
      // Ignore errors - read marking is not critical
    }

    return ApiResponse.success(result, i18n.t('chat.messagesFetched'));
  }

  @ApiExtraModels(ApiResponse, GenerateChatPresignedUrlDto)
  @Post('generate-presigned-url')
  @ApiOperation({
    summary:
      'Generate pre-signed URL for chat media upload (IMAGE only). Note: Limited to 2 image uploads per day per user.',
  })
  @ApiCreatedResponse({
    description: 'Pre-signed URL generated successfully',
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiResponse) },
        {
          properties: {
            success: { type: 'boolean', example: true },
            statusCode: { type: 'number', example: 201 },
            message: {
              type: 'string',
              example: 'Pre-signed URL generated successfully',
            },
            data: {
              type: 'object',
              properties: {
                url: {
                  type: 'string',
                  example:
                    'https://s3.amazonaws.com/bucket/chat/conversation-id/file.jpg?X-Amz-Algorithm=...',
                },
                key: {
                  type: 'string',
                  example: 'chat/conversation-id/uuid-file.jpg',
                },
                expiresIn: { type: 'number', example: 900 },
                fileName: { type: 'string', example: 'uuid-file.jpg' },
              },
            },
          },
        },
      ],
    },
  })
  async generatePresignedUrl(
    @GetUser() user: JwtPayload,
    @Body() dto: GenerateChatPresignedUrlDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<PresignedUrlResponse>> {
    const result = await this.chatService.generateChatPresignedUrl(
      user.userId,
      dto,
    );
    return ApiResponse.created(result, i18n.t('chat.presignedUrlGenerated'));
  }

  @ApiExtraModels(ApiResponse)
  @Post('media/signed-url')
  @ApiOperation({
    summary: 'Generate signed URL for media file (for Frontend)',
  })
  @ApiCreatedResponse({
    description: 'Signed URL generated successfully',
  })
  async getSignedUrlForMedia(
    @Body() body: { mediaUrl: string },
    @GetUser() user: JwtPayload,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<{ signedUrl: string }>> {
    const signedUrl = await this.chatService.getSignedUrlForMedia(
      body.mediaUrl,
    );
    if (!signedUrl) {
      throw new BadRequestException(
        'INVALID_MEDIA_URL',
        'chat.errors.invalidMediaUrl',
      );
    }
    return ApiResponse.success(
      { signedUrl },
      i18n.t('chat.signedUrlGenerated'),
    );
  }

  @ApiExtraModels(ApiResponse, SendMessageDto)
  @Post('messages')
  @ApiOperation({
    summary:
      'Send a message with optional text content and a file attachment. Supports TEXT and IMAGE types. Note: Only 1 image can be sent per message, and users are limited to 2 images per day.',
  })
  @ApiCreatedResponse({
    description: 'Message sent successfully',
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiResponse) },
        {
          properties: {
            success: { type: 'boolean', example: true },
            statusCode: { type: 'number', example: 201 },
            message: {
              type: 'string',
              example: 'Message sent',
            },
            data: {
              type: 'object',
              properties: {
                message: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    conversationId: { type: 'string' },
                    senderId: { type: 'string' },
                    type: {
                      type: 'string',
                      enum: ['TEXT', 'IMAGE', 'VIDEO', 'FILE'],
                    },
                    content: { type: 'string', nullable: true },
                    fileName: { type: 'string', nullable: true },
                    mediaUrl: { type: 'string', nullable: true },
                    mimeType: { type: 'string', nullable: true },
                    size: { type: 'number', nullable: true },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      ],
    },
  })
  async sendMessageAlias(
    @Body() dto: SendMessageDto,
    @GetUser() user: JwtPayload,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<{ message: any }>> {
    const message = await this.chatService.sendMessage(user.userId, dto);
    return ApiResponse.created({ message }, i18n.t('chat.messageSent'));
  }

  @ApiExtraModels(ApiResponse)
  @Patch('presence/online')
  @ApiOperation({ summary: 'Mark user as online (for Lambda)' })
  @ApiOkResponse({
    description: 'User marked as online successfully',
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiResponse) },
        {
          properties: {
            success: { type: 'boolean', example: true },
            statusCode: { type: 'number', example: 200 },
            message: {
              type: 'string',
              example: 'User marked online',
            },
            data: { type: 'null', example: null },
          },
        },
      ],
    },
  })
  async markOnline(
    @GetUser() user: JwtPayload,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<null>> {
    await this.chatService.setPresenceOnline(user.userId);
    return ApiResponse.success(null, i18n.t('chat.online'));
  }

  @ApiExtraModels(ApiResponse)
  @Patch('presence/offline')
  @ApiOperation({ summary: 'Mark user as offline (for Lambda)' })
  @ApiOkResponse({
    description: 'User marked as offline successfully',
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiResponse) },
        {
          properties: {
            success: { type: 'boolean', example: true },
            statusCode: { type: 'number', example: 200 },
            message: {
              type: 'string',
              example: 'User marked offline',
            },
            data: { type: 'null', example: null },
          },
        },
      ],
    },
  })
  async markOffline(
    @GetUser() user: JwtPayload,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<null>> {
    await this.chatService.setPresenceOffline(user.userId);
    return ApiResponse.success(null, i18n.t('chat.offline'));
  }

  @ApiExtraModels(ApiResponse)
  @Get('presence/:userId')
  @ApiOperation({ summary: 'Get user presence status (for Lambda)' })
  @ApiParam({
    name: 'userId',
    description: 'User auth ID',
    example: '019b5947-8486-77df-a8c3-7622c93626be',
  })
  @ApiOkResponse({
    description: 'User presence retrieved successfully',
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiResponse) },
        {
          properties: {
            success: { type: 'boolean', example: true },
            statusCode: { type: 'number', example: 200 },
            message: {
              type: 'string',
              example: 'User presence fetched',
            },
            data: {
              type: 'object',
              properties: {
                presence: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    userId: { type: 'string' },
                    isOnline: { type: 'boolean', example: true },
                    lastSeenAt: {
                      type: 'string',
                      format: 'date-time',
                      nullable: true,
                    },
                  },
                },
              },
            },
          },
        },
      ],
    },
  })
  async getPresence(
    @Param('userId') userId: string,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<{ presence: UserPresenceResponse | null }>> {
    const presence = await this.chatService.getPresence(userId);
    return ApiResponse.success({ presence }, i18n.t('chat.presenceFetched'));
  }

  @Public()
  @ApiExtraModels(ApiResponse)
  @Post('websocket/connection')
  @ApiOperation({ summary: 'Store WebSocket connection (for Lambda)' })
  @ApiCreatedResponse({
    description: 'Connection stored successfully',
  })
  async storeConnection(
    @Body() body: { connectionId: string; userId: string; token?: string },
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<null>> {
    if (!body.connectionId?.trim()) {
      throw new BadRequestException(
        'INVALID_CONNECTION_ID',
        'validation.required',
      );
    }
    if (!body.userId?.trim()) {
      throw new BadRequestException('INVALID_AUTH_ID', 'validation.required');
    }

    await this.chatService.storeWebSocketConnection(
      body.connectionId,
      body.userId,
      body.token,
    );

    return ApiResponse.created(null, i18n.t('chat.socket.stored'));
  }

  @Public()
  @ApiExtraModels(ApiResponse)
  @Get('websocket/connection/:connectionId')
  @ApiOperation({ summary: 'Get WebSocket connection (for Lambda)' })
  @ApiOkResponse({
    description: 'Connection retrieved successfully',
  })
  async getConnection(
    @Param('connectionId') connectionId: string,
    @I18n() i18n: I18nContext,
  ): Promise<
    ApiResponse<{ connection: { connectionId: string; userId: string } | null }>
  > {
    const connection = await this.chatService.getWebSocketConnection(
      connectionId.trim(),
    );
    return ApiResponse.success({ connection }, i18n.t('chat.socket.retrieved'));
  }

  @Public()
  @ApiExtraModels(ApiResponse)
  @Delete('websocket/connection/:connectionId')
  @ApiOperation({ summary: 'Delete WebSocket connection (for Lambda)' })
  @ApiOkResponse({
    description: 'Connection deleted successfully',
  })
  async deleteConnection(
    @Param('connectionId') connectionId: string,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<null>> {
    let decodedConnectionId = connectionId;
    try {
      if (connectionId.includes('%')) {
        decodedConnectionId = decodeURIComponent(connectionId);
      }
    } catch {
      decodedConnectionId = connectionId;
    }
    await this.chatService.deleteWebSocketConnection(decodedConnectionId);
    return ApiResponse.success(null, i18n.t('chat.socket.deleted'));
  }

  @Public()
  @ApiExtraModels(ApiResponse)
  @Get('websocket/connections/:userId')
  @ApiOperation({ summary: 'Get all connections for a user (for Lambda)' })
  @ApiOkResponse({
    description: 'Connections retrieved successfully',
  })
  async getUserConnections(
    @Param('userId') userId: string,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<{ connections: Array<{ connectionId: string }> }>> {
    const connections =
      await this.chatService.getUserWebSocketConnections(userId);
    return ApiResponse.success(
      {
        connections: connections.map((c) => ({ connectionId: c.connectionId })),
      },
      i18n.t('chat.socket.list'),
    );
  }
}
