// dto/update-profile-response.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  authId: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiPropertyOptional()
  profileImage?: string | null;

  @ApiPropertyOptional()
  phone?: string | null;

  @ApiPropertyOptional()
  bio?: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  email: string;
}

export class MutualFriendPreviewDto {
  @ApiProperty({
    description: 'Mutual friend user ID',
    example: 'c7c2f0d4-6f3d-4d11-9c2f-1d8f9f123abc',
  })
  id: string;

  @ApiPropertyOptional({
    description: 'Profile image signed URL',
    example: 'https://your-bucket.s3.amazonaws.com/profiles/abc123.jpg',
    nullable: true,
  })
  profileImage: string | null;
}

export class PublicUserProfileResponseDto {
  id: string;

  firstName: string;

  lastName: string;

  email: string;

  profileImage: string | null;

  bio: string | null;

  isPrivate: boolean;

  currentStreak: number;

  highestStreak: number;

  totalSavings: number;

  totalCheers: number;

  totalPosts: number;

  followersCount: number;

  followingCount: number;

  followStatus: 'FOLLOWING' | 'REQUESTED' | 'NOT_FOLLOWING';

  isMe: boolean;

  createdAt: Date;

  mutualFriendsCount: number;

  mutualFriends: MutualFriendPreviewDto[];

  unreadCount?: {
    notification: number;
    conversations: number;
  };
}
