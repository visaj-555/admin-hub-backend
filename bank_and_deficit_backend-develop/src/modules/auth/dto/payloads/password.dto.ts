import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Current account password',
    example: 'OldPass@123',
    required: true,
  })
  @IsNotEmpty({ message: 'validation.required' })
  @IsString({ message: 'validation.string' })
  currentPassword: string;

  @ApiProperty({
    description:
      'New password. Must be 8-20 characters and include at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character',
    example: 'NewStrong@123',
    minLength: 8,
    maxLength: 20,
    pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[!@#$%^&*(),.?":{}|<>]).*$',
  })
  @IsNotEmpty({ message: 'validation.required' })
  @IsString({ message: 'validation.string' })
  @MinLength(8, { message: 'auth.validation.password_min_length' })
  @MaxLength(20, { message: 'auth.validation.password_max_length' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).*$/, {
    message: 'auth.validation.password_pattern',
  })
  newPassword: string;
}

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Reset token received from verify-forgot-otp endpoint',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsNotEmpty({ message: 'validation.required' })
  @IsString({ message: 'validation.string' })
  resetToken: string;

  @ApiProperty({
    description:
      'New password. Must be 8-20 characters and include at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character',
    example: 'Strong@123',
    minLength: 8,
    maxLength: 20,
    pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[!@#$%^&*(),.?":{}|<>]).*$',
  })
  @IsNotEmpty({ message: 'validation.required' })
  @IsString({ message: 'validation.string' })
  @MinLength(8, { message: 'auth.validation.password_min_length' })
  @MaxLength(20, { message: 'auth.validation.password_max_length' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).*$/, {
    message: 'auth.validation.password_pattern',
  })
  newPassword: string;
}
