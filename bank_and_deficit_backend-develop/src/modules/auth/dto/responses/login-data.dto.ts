import { ApiProperty } from '@nestjs/swagger';
import { Role } from 'generated/prisma/client';

export class LoginDataDto {
  @ApiProperty({
    description: 'JWT access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'JWT refresh token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken: string;

  @ApiProperty({
    example: '019b3b95-9c4d-70ac-a228-903e54f13c95',
  })
  id: string;

  @ApiProperty({ enum: Role, example: Role.USER })
  role: Role;

  @ApiProperty()
  userId: string;
}
