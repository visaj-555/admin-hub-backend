import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterDeviceTokenDto {
  @ApiProperty({
    description: 'The FCM device registration token',
    example: 'd_f123A...bcd',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiPropertyOptional({
    description: 'IANA timezone',
    example: 'Asia/Kolkata',
  })
  @IsOptional()
  @IsString()
  timezone?: string;
}
