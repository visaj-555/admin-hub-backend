import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID,
  Min,
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsOptional,
} from 'class-validator';
import { MessageType } from 'generated/prisma/enums';
import { PaginationDto } from 'src/common/dto/pagination.dto';

export class CreateChatDto {
  @ApiProperty({
    description: 'Auth ID of the person you want to chat with (1-1 chat)',
    example: '019b5947-8486-77df-a8c3-7622c93626be',
  })
  @IsUUID(undefined, { message: 'validation.uuid' })
  @IsNotEmpty({ message: 'validation.required' })
  receiverId: string;
}

export class QueryConversationDto extends PaginationDto {
  @ApiProperty({
    description:
      'Optional search term to filter conversations by participant name',
    example: 'John',
    required: false,
  })
  @IsString({ message: 'validation.string' })
  @IsOptional()
  search?: string;
}

export class GetConversationByReceiverDto {
  @ApiProperty({
    description: 'Auth ID of the receiver to find conversation with',
    example: '019b5947-8486-77df-a8c3-7622c93626be',
  })
  @IsUUID(undefined, { message: 'validation.uuid' })
  @IsNotEmpty({ message: 'validation.required' })
  receiverId: string;
}

export class GenerateChatPresignedUrlDto {
  @ApiProperty({
    description: 'Conversation ID',
    example: '019b5947-8486-77df-a8c3-7622c93626be',
  })
  @IsUUID(undefined, { message: 'validation.uuid' })
  @IsNotEmpty({ message: 'validation.required' })
  conversationId: string;

  @ApiProperty({
    description: 'File name with extension',
    example: 'image.jpg',
  })
  @IsString({ message: 'validation.string' })
  @IsNotEmpty({ message: 'validation.required' })
  fileName: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 1048576,
    minimum: 1,
  })
  @IsNumber({}, { message: 'validation.number' })
  @Min(1, { message: 'validation.min' })
  fileSize: number;

  @ApiProperty({
    description: 'Message type (IMAGE, VIDEO, or FILE)',
    enum: MessageType,
    example: MessageType.IMAGE,
  })
  @IsEnum(MessageType, { message: 'validation.invalidEnum' })
  @IsNotEmpty({ message: 'validation.required' })
  type: MessageType;
}
