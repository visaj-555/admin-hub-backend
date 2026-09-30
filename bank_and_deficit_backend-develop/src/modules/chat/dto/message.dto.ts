import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MessageType } from 'generated/prisma/enums';

export class MessageAttachmentDto {
  @ApiProperty({
    description: 'Attachment type',
    enum: MessageType,
    example: MessageType.IMAGE,
  })
  @IsEnum(MessageType, { message: 'validation.invalidEnum' })
  @IsNotEmpty({ message: 'validation.required' })
  type: MessageType;

  @ApiProperty({
    description: 'Original file name with extension',
    example: 'image.jpg',
  })
  @IsString({ message: 'validation.string' })
  @IsNotEmpty({ message: 'validation.required' })
  fileName: string;

  @ApiProperty({
    description: 'S3 object key or media URL for the attachment',
    example: 'chat/conversation-id/uuid-image.jpg',
  })
  @IsString({ message: 'validation.string' })
  @IsNotEmpty({ message: 'validation.required' })
  mediaUrl: string;

  @ApiPropertyOptional({
    description: 'MIME type of the attachment',
    example: 'image/jpeg',
  })
  @IsOptional()
  @IsString({ message: 'validation.string' })
  mimeType?: string;

  @ApiPropertyOptional({
    description: 'File size in bytes',
    example: 1048576,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber({}, { message: 'validation.number' })
  @Min(1, { message: 'validation.min' })
  size?: number;
}

export class SendMessageDto {
  @ApiProperty({
    description:
      'Conversation ID (or receiverId if conversation does not exist)',
    example: '019b5947-8486-77df-a8c3-7622c93626be',
  })
  @IsUUID(undefined, { message: 'validation.uuid' })
  @IsNotEmpty({ message: 'validation.required' })
  conversationId: string;

  @ApiPropertyOptional({
    description:
      'Receiver ID (required if conversation does not exist, for auto-creation)',
    example: '019b5947-8486-77df-a8c3-7622c93626be',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'validation.uuid' })
  receiverId?: string;

  @ApiProperty({
    description:
      'Primary message type. For messages with attachments, this is usually the first attachment type.',
    enum: MessageType,
    example: MessageType.TEXT,
  })
  @IsEnum(MessageType, { message: 'validation.invalidEnum' })
  @IsNotEmpty({ message: 'validation.required' })
  type: MessageType;

  @ApiPropertyOptional({
    description:
      'Message text content (optional, can be sent together with attachments like WhatsApp)',
    example: 'Check out these images!',
  })
  @IsOptional()
  @IsString({ message: 'validation.string' })
  content?: string;

  @ApiPropertyOptional({
    description:
      'Single media URL (legacy field). If provided without attachments, backend will create a single attachment from it.',
    example: 'chat/conversation-id/uuid-file.jpg',
  })
  @IsOptional()
  @IsString({ message: 'validation.string' })
  mediaUrl?: string;

  @ApiPropertyOptional({
    description: 'MIME type of the legacy single media file',
    example: 'image/jpeg',
  })
  @IsOptional()
  @IsString({ message: 'validation.string' })
  mimeType?: string;

  @ApiPropertyOptional({
    description: 'File size in bytes (legacy single media field)',
    example: 1048576,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber({}, { message: 'validation.number' })
  @Min(1, { message: 'validation.min' })
  size?: number;

  @ApiPropertyOptional({
    description:
      'Original file name with extension for the legacy single media field',
    example: 'document.pdf',
  })
  @IsOptional()
  @IsString({ message: 'validation.string' })
  fileName?: string;

  @ApiPropertyOptional({
    description: 'Attachment for this message.',
    type: () => MessageAttachmentDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => MessageAttachmentDto)
  attachment?: MessageAttachmentDto;
}
