import { ApiProperty } from '@nestjs/swagger';
import { Role } from 'generated/prisma/client';

export class AuthPublicDataDto {
  @ApiProperty({ example: 'clx123abc' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ enum: Role, example: Role.USER })
  role: Role;

  @ApiProperty({ example: false })
  isActive: boolean;

  @ApiProperty({ example: false })
  isEmailVerified: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}
