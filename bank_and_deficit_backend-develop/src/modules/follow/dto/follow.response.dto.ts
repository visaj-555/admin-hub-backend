import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from 'src/common/common.exports';

export class FollowResponseDto {
  @ApiProperty({
    description: 'Follow record ID',
    example: 'a1b2c3d4-5678-9abc-def0-1234567890ab',
  })
  id: string;

  @ApiProperty({
    description: 'ID of the follower',
    example: 'b2d4d6f8-1234-4f56-89ab-7c8d9e0f1234',
  })
  followerId: string;

  @ApiProperty({
    description: 'ID of the user being followed',
    example: 'c7c2f0d4-6f3d-4d11-9c2f-1d8f9f123abc',
  })
  followingId: string;

  @ApiProperty({
    description: 'Current status of the follow',
    enum: ['PENDING', 'ACCEPTED', 'REJECTED'],
    example: 'ACCEPTED',
  })
  status: string;

  @ApiProperty({
    description: 'When the follow request was created',
    example: '2025-05-22T12:34:56.789Z',
  })
  createdAt: Date;
}

export class UserFollowListDto extends PaginationDto {
  @ApiProperty({
    description: 'User ID',
    example: 'c7c2f0d4-6f3d-4d11-9c2f-1d8f9f123abc',
  })
  id: string;

  @ApiProperty({
    description: 'Full name (firstName + lastName)',
    example: 'Rahul Sharma',
  })
  fullName: string;

  @ApiPropertyOptional({
    description: 'Profile image signed URL',
    example: 'https://your-bucket.s3.amazonaws.com/profiles/abc123.jpg',
    nullable: true,
  })
  profileImage?: string | null;

  @ApiPropertyOptional({
    description: 'Follow status (only applicable in pending requests)',
    example: 'PENDING',
    nullable: true,
  })
  status?: string | null;

  @ApiProperty({
    description: 'Current streak count',
    example: 15,
  })
  currentStreak: number;

  @ApiProperty({
    description: 'Total savings amount',
    example: 12500,
  })
  totalSavings: number;
}

export class FollowListDto extends PaginationDto {
  @ApiPropertyOptional({
    example: 'john',
    description: 'Search by firstName or lastName',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
