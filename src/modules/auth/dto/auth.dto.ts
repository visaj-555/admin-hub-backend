import { ApiProperty } from '@nestjs/swagger';
import { UserRole, UserStatus } from '../../../generated/prisma/client.js';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { ApiResponseDto } from '../../../common/dto/api-response.dto.js';

export class LoginDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ writeOnly: true })
  @IsString()
  password: string;
}


export class AuthUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty({ type: String, nullable: true, example: '' })
  lastName: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  profileImage: string | null;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty({ enum: UserStatus })
  status: UserStatus;
}

export class LoginDataDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty({ nullable: true })
  lastName: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  profileImage: string | null;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;
}

export class LoginResponseDto extends ApiResponseDto<LoginDataDto> {
  @ApiProperty({ type: String, example: 'Logged in Successfully' })
  declare message?: string;

  @ApiProperty({ type: LoginDataDto })
  declare data: LoginDataDto;
}
