import {
  ApiHideProperty,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BookingStatus } from '../../../generated/prisma/client.js';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '../../../common/dto/pagination.dto.js';
import { ApiResponseDto } from '../../../common/dto/api-response.dto.js';

export enum BookingWhen {
  ALL = 'ALL',
  UPCOMING = 'UPCOMING',
  PAST = 'PAST',
}

export const BookingStatusFilter = {
  ALL: 'ALL',
  PENDING: BookingStatus.PENDING,
  CONFIRMED: BookingStatus.CONFIRMED,
  COMPLETED: BookingStatus.COMPLETED,
  CANCELLED: BookingStatus.CANCELLED,
} as const;

export type BookingStatusFilter =
  (typeof BookingStatusFilter)[keyof typeof BookingStatusFilter];

export enum BookingSortBy {
  DATE = 'date',
  SCHEDULED_AT = 'scheduledAt',
  STATUS = 'status',
  BOOKING_NUMBER = 'bookingNumber',
}

export enum BookingDurationValue {
  ONE_HOUR = '1hr',
  ONE_AND_HALF_HOURS = '1.5hr',
  TWO_HOURS = '2hr',
}

export enum BookingSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class BookingsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search booking number, customer name, or service',
    example: 'Consultation',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({
    enum: BookingStatusFilter,
    default: BookingStatusFilter.ALL,
    example: BookingStatusFilter.ALL,
  })
  @IsOptional()
  @IsEnum(BookingStatusFilter)
  status: BookingStatusFilter = BookingStatusFilter.ALL;

  @ApiPropertyOptional({ enum: BookingWhen, default: BookingWhen.ALL })
  @IsOptional()
  @IsEnum(BookingWhen)
  when = BookingWhen.ALL;

  @ApiPropertyOptional({ format: 'date-time', example: '2026-09-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ format: 'date-time', example: '2026-09-30T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({
    enum: BookingSortBy,
    default: BookingSortBy.SCHEDULED_AT,
  })
  @IsOptional()
  @IsEnum(BookingSortBy)
  sortBy = BookingSortBy.SCHEDULED_AT;

  @ApiPropertyOptional({
    enum: BookingSortOrder,
    default: BookingSortOrder.ASC,
  })
  @IsOptional()
  @IsEnum(BookingSortOrder)
  sortOrder = BookingSortOrder.ASC;
}

export class CreateBookingDto {
  @ApiProperty({ format: 'uuid', example: '50a712d7-eb0b-42d6-9e42-35da3d519d3c' })
  @IsUUID('all')
  userId: string;

  @ApiProperty({ maxLength: 120, example: 'Consultation' })
  @IsString()
  @MaxLength(120)
  service: string;

  @ApiProperty({ type: Number, minimum: 0, maximum: 999999999999.99, example: 2500 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  amount: number;

  @ApiProperty({ enum: BookingDurationValue, example: BookingDurationValue.ONE_HOUR })
  @IsEnum(BookingDurationValue)
  duration: BookingDurationValue;

  @ApiProperty({ format: 'date-time', example: '2026-10-15T14:00:00.000Z' })
  @IsDateString()
  date: string;
}

export class UpdateBookingDto {
  @ApiPropertyOptional({ maxLength: 120, example: 'Consultation' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  service?: string;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 999999999999.99, example: 2500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  amount?: number;

  @ApiPropertyOptional({ enum: BookingDurationValue, example: BookingDurationValue.ONE_HOUR })
  @IsOptional()
  @IsEnum(BookingDurationValue)
  duration?: BookingDurationValue;

  @ApiPropertyOptional({ format: 'date-time', example: '2026-10-15T14:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}

export class BookingParamDto {
  @ApiProperty({
    description: 'Booking UUID or public booking number',
    example: 'BKG-0045',
  })
  @Matches(
    /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|BKG-[A-Z0-9-]{1,30})$/i,
  )
  id: string;
}

export class BookingUserDto {
  @ApiProperty({ format: 'uuid', example: '50a712d7-eb0b-42d6-9e42-35da3d519d3c' })
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
}

export class BookingResponseDto {
  @ApiProperty({ format: 'uuid', example: '0b41df31-6975-4f0f-b8b6-c0e2256b6281' })
  id: string;

  @ApiProperty({ example: 'BKG-0045' })
  bookingNumber: string;

  @ApiProperty({ example: 'Consultation' })
  service: string;

  @ApiProperty({ format: 'uuid', example: '50a712d7-eb0b-42d6-9e42-35da3d519d3c' })
  userId: string;

  @ApiProperty({ type: Number, example: 2500 })
  amount: number;

  @ApiProperty({ enum: BookingDurationValue, example: BookingDurationValue.ONE_HOUR })
  duration: BookingDurationValue;

  @ApiProperty({ type: BookingUserDto })
  user: BookingUserDto;

  @ApiProperty({ format: 'date-time', example: '2026-10-15T14:00:00.000Z' })
  date: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-15T14:00:00.000Z', deprecated: true })
  scheduledAt: string;

  @ApiProperty({ enum: BookingStatus, example: BookingStatus.CONFIRMED })
  status: BookingStatus;

  @ApiProperty({ format: 'date-time', example: '2026-09-25T09:30:00.000Z' })
  createdAt: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-30T08:15:00.000Z' })
  updatedAt: string;
}

export class BookingListUserDto {
  @ApiProperty({ format: 'uuid', example: '50a712d7-eb0b-42d6-9e42-35da3d519d3c' })
  id: string;

  @ApiProperty({ example: 'Visaj Panchal' })
  name: string;

  @ApiProperty({ type: String, nullable: true, example: null })
  profileImage: string | null;
}

export class BookingListItemDto {
  @ApiProperty({ format: 'uuid', example: '0b41df31-6975-4f0f-b8b6-c0e2256b6281' })
  id: string;

  @ApiProperty({ example: 'BKG-0045' })
  bookingNumber: string;

  @ApiProperty({ type: BookingListUserDto })
  user: BookingListUserDto;

  @ApiProperty({ example: 'Consultation' })
  service: string;

  @ApiProperty({ format: 'date', example: '2026-10-15' })
  date: string;

  @ApiProperty({ example: '14:00', description: 'UTC time in 24-hour format' })
  time: string;

  @ApiProperty({ enum: BookingDurationValue, example: BookingDurationValue.ONE_HOUR })
  duration: BookingDurationValue;

  @ApiProperty({ enum: BookingStatus, example: BookingStatus.PENDING })
  status: BookingStatus;

  @ApiProperty({ type: Number, example: 2500 })
  amount: number;
}

export class BookingSummaryMetricDto {
  @ApiProperty({ type: Number, example: 50 })
  count: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 85.2,
    description: 'Percentage change from the previous calendar month; null when no baseline exists',
  })
  changeVsLastMonth: number | null;

  @ApiProperty({ example: 'percent' })
  changeUnit: 'percent';
}

export class BookingsSummaryDto {
  @ApiProperty({ type: BookingSummaryMetricDto })
  totalBookings: BookingSummaryMetricDto;

  @ApiProperty({ type: BookingSummaryMetricDto })
  activeBookings: BookingSummaryMetricDto;

  @ApiProperty({ type: BookingSummaryMetricDto })
  completedBookings: BookingSummaryMetricDto;

  @ApiProperty({ type: BookingSummaryMetricDto })
  cancelledBookings: BookingSummaryMetricDto;
}

export class BookingListDataDto {
  @ApiProperty({ type: [BookingListItemDto] })
  bookings: BookingListItemDto[];

  @ApiProperty({ type: BookingsSummaryDto })
  bookingsSummary: BookingsSummaryDto;
}

export class BookingListResponseDto extends ApiResponseDto<
  BookingListDataDto,
  PaginationMetaDto
> {
  @ApiProperty({ type: String, example: 'Bookings fetched successfully' })
  declare message?: string;

  @ApiProperty({ type: BookingListDataDto })
  declare data: BookingListDataDto;

  @ApiProperty({ type: PaginationMetaDto })
  declare meta: PaginationMetaDto;

  @ApiHideProperty()
  declare bookingsSummary?: Record<string, unknown>;
}

export class BookingResponseEnvelopeDto extends ApiResponseDto<BookingResponseDto> {
  @ApiProperty({ type: String, example: 'Booking request completed successfully' })
  declare message?: string;

  @ApiProperty({ type: BookingResponseDto })
  declare data: BookingResponseDto;
}

export class BookingDetailUserDto {
  @ApiProperty({ format: 'uuid', example: '50a712d7-eb0b-42d6-9e42-35da3d519d3c' })
  id: string;

  @ApiProperty({ example: 'Lincoln Kelly' })
  fullName: string;

  @ApiProperty({ type: String, format: 'email', nullable: true, example: 'lincoln.kelly@example.com' })
  email: string | null;

  @ApiProperty({ type: Number, example: 9 })
  completedBookings: number;
}

export class BookingDetailDto {
  @ApiProperty({ format: 'uuid', example: '0b41df31-6975-4f0f-b8b6-c0e2256b6281' })
  id: string;

  @ApiProperty({ example: '#BKG-0045' })
  bookingNumber: string;

  @ApiProperty({ example: 'House Showpiece Plant' })
  service: string;

  @ApiProperty({ type: Number, example: 39.99 })
  amount: number;

  @ApiProperty({ enum: ['60_MINUTES', '90_MINUTES', '120_MINUTES'], example: '90_MINUTES' })
  duration: '60_MINUTES' | '90_MINUTES' | '120_MINUTES';

  @ApiProperty({ format: 'date-time', example: '2026-11-14T11:00:00.000Z' })
  date: string;

  @ApiProperty({ enum: BookingStatus, example: BookingStatus.CONFIRMED })
  status: BookingStatus;

  @ApiProperty({ format: 'date-time', example: '2026-11-13T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ format: 'date-time', example: '2026-11-14T09:00:00.000Z' })
  updatedAt: string;

  @ApiProperty({ type: BookingDetailUserDto })
  user: BookingDetailUserDto;
}

export class BookingDetailEnvelopeDto extends ApiResponseDto<BookingDetailDto> {
  @ApiProperty({ type: String, example: 'Booking details fetched successfully' })
  declare message?: string;

  @ApiProperty({ type: BookingDetailDto })
  declare data: BookingDetailDto;
}
