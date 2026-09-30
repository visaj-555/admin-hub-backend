import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaType, PostStatus, Visibility } from 'generated/prisma/client';
import { PostAuthorProfileDto } from './post.feed.response';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { POST_CONFIG } from '../../post.config';

export class PresignedUrlResponseDto {
  @ApiProperty({
    example:
      'https://bucket-name.s3.amazonaws.com/uploads/image.png?X-Amz-Algorithm=AWS4-HMAC-SHA256',
    description: 'Presigned upload URL',
  })
  url: string;

  @ApiProperty({
    example: 'uploads/1747728123-image.png',
    description: 'Storage key of the uploaded file',
  })
  key: string;

  @ApiProperty({
    example: 3600,
    description: 'URL expiration time in seconds',
  })
  expiresIn: number;

  @ApiProperty({
    example: 'image.png',
    description: 'Original file name',
  })
  fileName: string;

  @ApiProperty({
    example: 'c7c2f0d4-6f3d-4d11-9c2f-1d8f9f123abc',
    required: false,
    nullable: true,
    description: 'Optional media ID',
  })
  mediaId?: string;
}

export class PostMediaResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: MediaType })
  type: MediaType;

  @ApiProperty({
    nullable: true,
  })
  url: string | null;

  @ApiProperty()
  mimeType: string;

  @ApiProperty()
  size: string;

  @ApiProperty()
  thumbnailUrl?: string | null;
}

export class ConfirmedPostResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  description: string | null;

  @ApiProperty({ enum: Visibility })
  visibility: Visibility;

  @ApiProperty({ enum: PostStatus })
  status: PostStatus;

  @ApiProperty()
  activityDate: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  isCheered: boolean;

  @ApiProperty()
  cheerCount: number;

  @ApiProperty({
    type: PostMediaResponseDto,
    nullable: true,
  })
  media: PostMediaResponseDto | null;

  @ApiProperty({ type: PostAuthorProfileDto })
  profile: PostAuthorProfileDto;
}

export class GenerateTempPresignedUrlDto {
  @ApiProperty({
    description: 'File name with extension',
    example: 'my-video.mp4',
  })
  @IsString({ message: 'validation.string' })
  @IsNotEmpty({ message: 'post.validation.fileNameRequired' })
  fileName: string;

  @ApiProperty({
    description: 'File type (IMAGE or VIDEO)',
    enum: MediaType,
    example: MediaType.VIDEO,
  })
  @IsEnum(MediaType, {
    message: 'post.validation.invalidFileType',
  })
  type: MediaType;

  @ApiProperty({
    description: 'File size in bytes',
    example: 10485760,
    minimum: 1,
    maximum: POST_CONFIG.VIDEO.MAX_SIZE_BYTES,
  })
  @IsNumber({}, { message: 'validation.number' })
  @Min(1, { message: 'validation.min' })
  @Max(POST_CONFIG.VIDEO.MAX_SIZE_BYTES, {
    message: 'validation.max',
  })
  size: number;

  @ApiPropertyOptional({
    description:
      'Media duration in milliseconds. Required for VIDEO; must not exceed 30 seconds (30000 ms). Ignored for IMAGE.',
    example: 15000,
    minimum: 1,
    maximum: POST_CONFIG.VIDEO.MAX_DURATION_MS,
  })
  @ValidateIf((o: GenerateTempPresignedUrlDto) => o.type === MediaType.VIDEO)
  @Type(() => Number)
  @IsNumber({}, { message: 'validation.number' })
  @IsNotEmpty({ message: 'post.validation.durationRequired' })
  @Min(1, { message: 'post.validation.durationMin' })
  @Max(POST_CONFIG.VIDEO.MAX_DURATION_MS, {
    message: 'post.validation.maxVideoDuration',
  })
  duration?: number;
}
