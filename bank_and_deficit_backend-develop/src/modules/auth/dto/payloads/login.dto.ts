// login.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Account email address',
    example: 'visaj.cilans@gmail.com',
  })
  @IsNotEmpty({
    message: 'auth.validation.email_required',
  })
  @IsEmail(
    {},
    {
      message: 'auth.validation.invalid_email',
    },
  )
  email: string;

  @ApiProperty({
    description: 'Account password',
    example: 'Test@123',
    required: true,
  })
  @IsNotEmpty({
    message: 'auth.validation.password_required',
  })
  @IsString({
    message: 'auth.validation.password_string',
  })
  password: string;
}
