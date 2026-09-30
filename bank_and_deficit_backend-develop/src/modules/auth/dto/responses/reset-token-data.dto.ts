import { ApiProperty } from '@nestjs/swagger';

export class ResetTokenDataDto {
  @ApiProperty({
    description: 'Token to use for the reset-password endpoint',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  resetToken: string;
}
