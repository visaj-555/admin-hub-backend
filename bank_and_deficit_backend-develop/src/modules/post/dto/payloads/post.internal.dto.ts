import { ApiProperty } from '@nestjs/swagger';
import { MediaType } from 'generated/prisma/enums';

// ============== INTERNAL: MEDIA UPDATE DTO ============== //

export class MediaUpdateDto {
  @ApiProperty({ example: 'c7c2f0d4-6f3d-4d11-9c2f-1d8f9f123abc' })
  id: string;

  @ApiProperty({ example: '2.50 MB' })
  size: string;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType: string;
}

// ============== INTERNAL: MEDIA CREATE DTO ============== //

export class MediaCreateDto {
  @ApiProperty({ enum: MediaType, example: MediaType.IMAGE })
  type: MediaType;

  @ApiProperty({ example: 'posts/user-123/uuid-filename.jpg' })
  url: string;

  @ApiProperty({ example: '2.50 MB' })
  size: string;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType: string;
}

// ============== INTERNAL: MEDIA TO DB CREATE DTO ============== //

export class MediaCreateWithPostDto extends MediaCreateDto {
  @ApiProperty({ example: 'b2d4d6f8-1234-4f56-89ab-7c8d9e0f1234' })
  postId: string;
}
