import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Account email address',
    example: 'user@example.com',
  })
  @IsNotEmpty({
    message: 'auth.validation.email_required',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail(
    {},
    {
      message: 'auth.validation.invalid_email',
    },
  )
  email: string;
}
