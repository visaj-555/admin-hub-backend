import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  MediaProcessingStatus,
  PostStatus,
  Visibility,
} from 'generated/prisma/enums';
import { UpdateProfileResponseDto } from 'src/modules/user/dto/user.response.dto';

export class UpdateCompressedMediaDto {
  @ApiProperty({
    example: '019e63ed-a462-76ae-ae4d-0600a711917e',
  })
  @IsString()
  @IsNotEmpty()
  mediaId: string;

  @ApiPropertyOptional({
    example: 'compressed/posts/abc/video.mp4',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  compressedKey?: string | null;

  @ApiProperty({
    enum: MediaProcessingStatus,
  })
  @IsEnum(MediaProcessingStatus)
  processingStatus: MediaProcessingStatus;
}

export class ConfirmNewUploadDto {
  @ApiProperty({
    description:
      'Optional post ID. If not provided, a new empty post will be created.',
    example: '019b3b95-9c4d-70ac-a228-903e54f13c95',
    required: false,
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'post.validation.invalidPostId' })
  postId?: string;

  @ApiProperty({
    description: 'Post description/text',
    example: 'This is a sample post description',
    required: true,
  })
  @IsString({ message: 'validation.string' })
  @MaxLength(1500, {
    message: 'post.validation.maxDescriptionLength',
  })
  description: string;

  @ApiProperty({
    description: 'Visibility of the post',
    enum: Visibility,
    example: Visibility.PRIVATE,
    required: false,
  })
  @IsEnum(Visibility, { message: 'post.validation.invalidVisibility' })
  @IsOptional()
  visibility?: Visibility;
}

export class ConfirmNewUploadResult {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: UpdateProfileResponseDto })
  profile: UpdateProfileResponseDto;

  @ApiProperty({ enum: PostStatus })
  status: PostStatus;

  @ApiProperty({ enum: Visibility })
  visibility: Visibility;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  activityDate: Date;

  @ApiProperty({ default: false })
  isLiked: boolean;

  @ApiProperty({ default: false })
  isSaved: boolean;

  @ApiProperty({ default: false })
  isReported: boolean;

  @ApiProperty()
  cheers: number;
}

export class UpdateThumbnailDto {
  @ApiProperty({
    description: 'S3 key of the thumbnail image',
    example: 'posts/user-id/thumbnails/video-thumbnail.jpg',
    required: true,
  })
  @IsString({ message: 'validation.string' })
  @IsNotEmpty({ message: 'post.validation.thumbnailUrlRequired' })
  thumbnailUrl: string;

  @ApiProperty({
    description: 'S3 key of the source video',
    example: 'posts/user-id/video.mp4',
    required: true,
  })
  @IsString({ message: 'validation.string' })
  @IsNotEmpty({ message: 'post.validation.videoUrlRequired' })
  videoUrl: string;
}
