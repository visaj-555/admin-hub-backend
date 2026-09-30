import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConfirmedPostResponseDto } from './post.create.response';
import { PaginationMetaDto } from 'src/common/common.exports';

export class FeedResponseDto {
  @ApiProperty({
    type: [ConfirmedPostResponseDto],
  })
  posts: ConfirmedPostResponseDto[];

  @ApiProperty()
  meta: PaginationMetaDto;
}

export class PostAuthorProfileDto {
  @ApiProperty({
    description: 'Author user id',
    example: 'clx123abc456',
  })
  id: string;

  @ApiProperty({
    description: 'Full name of the post author',
    example: 'Rahul Sharma',
  })
  fullName: string;

  @ApiPropertyOptional({
    description: 'Signed URL of author profile image',
    example: 'https://bucket.s3.amazonaws.com/profiles/abc123.jpg',
    nullable: true,
  })
  profileImage?: string | null;

  @ApiProperty({
    enum: ['FOLLOWING', 'REQUESTED', 'NOT_FOLLOWING'],
  })
  followStatus: 'FOLLOWING' | 'REQUESTED' | 'NOT_FOLLOWING';

  @ApiProperty({
    description: 'Whether the author is the currently authenticated user',
    example: true,
  })
  isMe: boolean;
}

export class DailyLogResponseDto {
  @ApiProperty({
    type: [ConfirmedPostResponseDto],
  })
  posts: ConfirmedPostResponseDto[];

  @ApiProperty({
    type: PaginationMetaDto,
  })
  meta: PaginationMetaDto;
}
