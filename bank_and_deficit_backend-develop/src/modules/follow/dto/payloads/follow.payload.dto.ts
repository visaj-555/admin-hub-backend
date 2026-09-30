import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum } from 'class-validator';
import { FollowStatus } from 'generated/prisma/enums';

export class SendFollowRequestDto {
  @ApiProperty({
    description: 'ID of the user you want to follow',
    example: 'c7c2f0d4-6f3d-4d11-9c2f-1d8f9f123abc',
  })
  @IsString({ message: 'validation.string' })
  @IsNotEmpty({ message: 'follow.validation.followingIdRequired' })
  followingId: string;
}

export class UpdateFollowStatusDto {
  @ApiProperty({
    description: 'ID of the user who sent the follow request',
    example: 'b2d4d6f8-1234-4f56-89ab-7c8d9e0f1234',
  })
  @IsString({ message: 'validation.string' })
  @IsNotEmpty({ message: 'follow.validation.followerIdRequired' })
  followerId: string;

  @ApiProperty({
    description: 'New status of the follow request',
    enum: FollowStatus,
    example: FollowStatus.ACCEPTED,
  })
  @IsEnum(FollowStatus, { message: 'follow.validation.invalidStatus' })
  @IsNotEmpty({ message: 'follow.validation.statusRequired' })
  status: FollowStatus;
}
