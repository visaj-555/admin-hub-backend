import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole, UserStatus } from '../../../generated/prisma/client.js';
import {
  DateFilterQueryDto,
  PaginationMetaDto,
} from '../../../common/dto/pagination.dto.js';
import { ApiResponseDto } from '../../../common/dto/api-response.dto.js';

export enum UserSortBy {
  JOINED_AT = 'joinedAt',
  NAME = 'name',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class UsersQueryDto extends DateFilterQueryDto {
  @ApiPropertyOptional({
    description: 'Search name or email',
    example: 'visaj',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: UserRole, example: UserRole.USER })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus, example: UserStatus.ACTIVE })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({
    enum: UserSortBy,
    default: UserSortBy.JOINED_AT,
    example: UserSortBy.JOINED_AT,
  })
  @IsOptional()
  @IsEnum(UserSortBy)
  sortBy = UserSortBy.JOINED_AT;

  @ApiPropertyOptional({
    enum: SortOrder,
    default: SortOrder.DESC,
    example: SortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder = SortOrder.DESC;
}

export class CreateUserDto {
  @ApiProperty({ maxLength: 80, example: 'Visaj' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  @ApiPropertyOptional({ maxLength: 80, nullable: true, example: 'Panchal' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string | null;

  @ApiProperty({ format: 'email' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ minLength: 10, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password: string;

  @ApiPropertyOptional({
    type: Number,
    minimum: 1_000_000_000,
    maximum: 9_999_999_999,
    example: 8200988308,
    nullable: true,
  })
  @Type(() => String)
  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: 'phone must be exactly 10 digits' })
  phone?: string | null;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Profile image upload (JPEG, PNG, or WebP; max 5 MB)',
  })
  profileImage?: never;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.USER })
  @IsOptional()
  @IsEnum(UserRole)
  role = UserRole.USER;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ maxLength: 80, example: 'Visaj' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional({ maxLength: 80, nullable: true, example: 'Panchal' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string | null;

  @ApiPropertyOptional({ format: 'email' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    type: Number,
    minimum: 1_000_000_000,
    maximum: 9_999_999_999,
    example: 8200988308,
    nullable: true,
  })
  @Type(() => String)
  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: 'phone must be exactly 10 digits' })
  phone?: string | null;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Profile image upload (JPEG, PNG, or WebP; max 5 MB)',
  })
  profileImage?: never;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class UserResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '50a712d7-eb0b-42d6-9e42-35da3d519d3c',
  })
  id: string;

  @ApiProperty({ example: 'Visaj' })
  firstName: string;

  @ApiProperty({ type: String, nullable: true, example: 'Panchal' })
  lastName: string | null;

  @ApiProperty({
    type: String,
    format: 'email',
    nullable: true,
    example: 'visaj@gmail.com',
  })
  email: string | null;

  @ApiProperty({ type: String, nullable: true, example: '8200988308' })
  phone: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  profileImage: string | null;

  @ApiProperty({ enum: UserRole, example: UserRole.USER })
  role: UserRole;

  @ApiProperty({ enum: UserStatus, example: UserStatus.ACTIVE })
  status: UserStatus;

  @ApiProperty({ format: 'date-time', example: '2026-09-25T09:30:00.000Z' })
  createdAt: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-30T08:15:00.000Z' })
  updatedAt: string;
}

export class UserAnalysisDto {
  @ApiProperty({ type: Number, example: 120 })
  totalUsers: number;

  @ApiProperty({ type: Number, example: 98 })
  activeUsers: number;

  @ApiProperty({ type: Number, example: 12 })
  newThisMonth: number;
}

export class UserPersonalInformationDto {
  @ApiProperty({ example: 'Nicholas Bailey' })
  fullName: string;

  @ApiProperty({ type: String, nullable: true, example: 'nicholas.bailey@example.com' })
  emailAddress: string | null;

  @ApiProperty({ type: String, nullable: true, example: '+1 555-010-2040' })
  phoneNumber: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  profileImage: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  dateOfBirth: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  mailingAddress: string | null;
}

export class UserAccountInformationDto {
  @ApiProperty({ example: '50a712d7-eb0b-42d6-9e42-35da3d519d3c' })
  userId: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-27T10:20:00.000Z' })
  joinedDate: string;

  @ApiProperty({ type: String, nullable: true, example: '3 days ago' })
  lastLoginActivity: string | null;

  @ApiProperty({ example: false })
  twoFactorSecurity: boolean;
}

export class UserRecentActivityDto {
  @ApiProperty({ example: 'Created booking' })
  activity: string;

  @ApiPropertyOptional({ example: '#BKG-0045' })
  referenceId?: string;

  @ApiPropertyOptional({ example: 'Booking scheduled for 2026-10-05T10:00:00.000Z' })
  description?: string;

  @ApiPropertyOptional({ example: 'Chrome on macOS' })
  device?: string;

  @ApiPropertyOptional({ example: 'New York, US' })
  location?: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-30T08:15:00.000Z' })
  date: string;

  @ApiProperty({ example: '2 hours ago' })
  time: string;
}

export class UserRecentTransactionDto {
  @ApiProperty({ example: '#TXN-0017' })
  id: string;

  @ApiProperty({ type: Number, example: 2450.75 })
  amount: number;

  @ApiProperty({ example: 'INR' })
  currency: string;

  @ApiProperty({ example: 'SUCCESS' })
  status: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-30T08:15:00.000Z' })
  date: string;
}

export class UserRecentBookingDto {
  @ApiProperty({ example: '#BKG-0045' })
  id: string;

  @ApiProperty({ example: 'Booking' })
  service: string;

  @ApiProperty({ example: 'CONFIRMED' })
  status: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-05T10:00:00.000Z' })
  date: string;

  @ApiProperty({ example: '10:00' })
  time: string;
}

export class UserDetailDto {
  @ApiProperty({ type: UserPersonalInformationDto })
  personalInformation: UserPersonalInformationDto;

  @ApiProperty({ type: UserAccountInformationDto })
  accountInformation: UserAccountInformationDto;

  @ApiProperty({ type: [UserRecentActivityDto] })
  recentActivityLog: UserRecentActivityDto[];

  @ApiProperty({ type: [UserRecentTransactionDto] })
  recentTransactions: UserRecentTransactionDto[];

  @ApiProperty({ type: [UserRecentBookingDto] })
  recentBookings: UserRecentBookingDto[];
}

export class UserListResponseDto extends ApiResponseDto<
  UserResponseDto[],
  PaginationMetaDto,
  Record<string, unknown>,
  UserAnalysisDto
> {
  @ApiProperty({ type: String, example: 'Users fetched successfully' })
  declare message?: string;

  @ApiProperty({ type: [UserResponseDto] })
  declare data: UserResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  declare meta: PaginationMetaDto;

  @ApiProperty({ type: UserAnalysisDto })
  declare analysis: UserAnalysisDto;
}

export class UserResponseEnvelopeDto extends ApiResponseDto<UserResponseDto> {
  @ApiProperty({ type: String, example: 'User request completed successfully' })
  declare message?: string;

  @ApiProperty({ type: UserResponseDto })
  declare data: UserResponseDto;
}

export class UserDetailResponseDto extends ApiResponseDto<UserDetailDto> {
  @ApiProperty({ type: String, example: 'User details fetched successfully' })
  declare message?: string;

  @ApiProperty({ type: UserDetailDto })
  declare data: UserDetailDto;
}
