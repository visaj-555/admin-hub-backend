import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';

export class GoogleSignInDto {
  @ApiProperty({
    description: 'Google ID token from the Flutter client',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...',
  })
  @IsNotEmpty({ message: 'auth.validation.google_id_token_required' })
  @IsString({ message: 'validation.string' })
  idToken: string;

  @ApiProperty({
    description: 'Platform of the client device (ios or android)',
    enum: ['ios', 'android'],
    example: 'ios',
    required: false,
  })
  @IsOptional()
  @IsEnum(['ios', 'android'], { message: 'auth.validation.invalid_platform' })
  platform?: 'ios' | 'android';
}
