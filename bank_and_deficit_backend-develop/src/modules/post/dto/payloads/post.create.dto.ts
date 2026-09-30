import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEnum,
  IsNumber,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MaxCharacters } from 'src/common/validators/char';
import { MediaType, Visibility } from 'generated/prisma/enums';
import { POST_CONFIG } from '../../post.config';
import { PresignedUrlResponseDto } from '../responses/post.create.response';

// ============== MEDIA FILE DTO ============== //
export class MediaFileDto {
  @ApiProperty({
    description: 'File name with extension',
    example: 'my-image.jpg',
  })
  @IsString({ message: 'validation.string' })
  @IsNotEmpty({ message: 'post.validation.fileNameRequired' })
  fileName: string;

  @ApiProperty({
    description: 'File type (IMAGE or VIDEO)',
    enum: MediaType,
    example: MediaType.IMAGE,
  })
  @IsEnum(MediaType, { message: 'post.validation.invalidFileType' })
  @IsNotEmpty({ message: 'post.validation.fileTypeRequired' })
  type: MediaType;

  @ApiProperty({
    description: 'File size in bytes',
    example: 1048576,
    minimum: 1,
  })
  @IsNumber({}, { message: 'validation.number' })
  @Min(1, { message: 'validation.min' })
  fileSize: number;
}

// ============== CREATE POST DTO ============== //
export class CreatePostDto {
  @ApiProperty({
    description: 'Post description/text',
    example: 'This is a sample post description',
    required: false,
  })
  @IsString({ message: 'validation.string' })
  @IsOptional()
  @MaxCharacters(1500, { message: 'post.validation.maxDescriptionLength' })
  description?: string;

  @ApiProperty({
    description: 'Visibility of the post',
    enum: Visibility,
    example: Visibility.PRIVATE,
    required: false,
  })
  @IsEnum(Visibility, { message: 'post.validation.invalidVisibility' })
  @IsOptional()
  visibility?: Visibility;

  @ApiProperty({
    description: 'Array of media files to upload',
    type: [MediaFileDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaFileDto)
  media?: MediaFileDto[];
}

// ============== GENERATE PRESIGNED URL DTO ============== //
export class GeneratePresignedUrlDto {
  @ApiProperty({
    description: 'File name with extension',
    example: 'my-image.jpg',
  })
  @IsString({ message: 'validation.string' })
  @IsNotEmpty({ message: 'post.validation.fileNameRequired' })
  fileName: string;

  @ApiProperty({
    description: 'File type (IMAGE or VIDEO)',
    enum: MediaType,
    example: MediaType.IMAGE,
  })
  @IsEnum(MediaType, { message: 'post.validation.invalidFileType' })
  @IsNotEmpty({ message: 'post.validation.fileTypeRequired' })
  type: MediaType;

  @ApiProperty({
    description: 'File size in bytes',
    example: 1048576,
    minimum: 1,
    maximum: POST_CONFIG.VIDEO.MAX_SIZE_BYTES,
  })
  @IsNumber({}, { message: 'validation.number' })
  @Min(1, { message: 'validation.min' })
  @Max(POST_CONFIG.VIDEO.MAX_SIZE_BYTES, { message: 'validation.max' })
  size: number;
}

// ============== CREATE POST RESPONSE DTO ============== //
export class CreatePostResponseDto {
  @ApiProperty({
    example: 'b2d4d6f8-1234-4f56-89ab-7c8d9e0f1234',
    description: 'Post ID',
  })
  postId: string;

  @ApiProperty({
    type: PresignedUrlResponseDto,
    description: 'Presigned upload URL',
  })
  presignedUrl: PresignedUrlResponseDto;
}

export class UpdatePostDto {
  @ApiPropertyOptional({
    example: 'Walked 5km today',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
