import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SearchedUserDto {
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
    description: 'Signed profile image URL',
    example: 'https://s3.amazonaws.com/profiles/abc123.jpg',
    nullable: true,
  })
  profileImage?: string | null;

  @ApiProperty({
    enum: ['FOLLOWING', 'REQUESTED', 'NOT_FOLLOWING'],
  })
  followStatus: 'FOLLOWING' | 'REQUESTED' | 'NOT_FOLLOWING';

  @ApiProperty({
    description: 'Whether the account is private',
    example: false,
  })
  isPrivate: boolean;
}

export class SearchUsersResponseDto {
  @ApiProperty({ type: [SearchedUserDto] })
  users: SearchedUserDto[];

  @ApiProperty()
  meta: any; // Use your existing PaginationMeta
}
