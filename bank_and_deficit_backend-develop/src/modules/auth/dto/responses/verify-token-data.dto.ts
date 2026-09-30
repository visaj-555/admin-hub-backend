import { ApiProperty } from '@nestjs/swagger';
import { Role } from 'generated/prisma/client';

export class VerifyTokenUserDto {
  @ApiProperty({ example: '019b3b95-9c4d-70ac-a228-903e54f13c95' })
  id: string;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    nullable: true,
    description: 'Domain user ID (User.id) used by chat and other modules',
  })
  userId: string | null;

  @ApiProperty({ example: 'John Doe' })
  name: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ enum: Role, example: Role.USER })
  role: Role;
}

export class VerifyTokenDataDto {
  @ApiProperty({ type: VerifyTokenUserDto })
  user: VerifyTokenUserDto;
}
