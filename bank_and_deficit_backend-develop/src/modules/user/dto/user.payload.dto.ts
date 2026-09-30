// dto/update-profile.dto.ts
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MaxCharacters } from 'src/common/validators/char';
import { Transform } from 'class-transformer';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  lastName?: string;

  @ApiPropertyOptional({ example: 'Full stack developer...' })
  @IsOptional()
  @IsString()
  @MaxCharacters(500, {
    message: 'profile.validation.bio_max_length',
  })
  bio?: string;

  @ApiPropertyOptional({
    example: 'user@example.com',
    description: 'User email address',
  })
  @IsOptional()
  @IsEmail({}, { message: 'auth.validation.invalid_email' })
  email: string;

  @ApiPropertyOptional({
    description: 'Flag to remove existing profile image',
    example: false,
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean({ message: 'validation.boolean' })
  removeProfileImage?: boolean;
}

export class GetUserProfileDto {
  @ApiProperty({
    description: 'Unique ID of the user',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  userId: string;
}
