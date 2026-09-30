import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  TransactionStatus,
  TransactionType,
} from '../../../generated/prisma/client.js';
import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '../../../common/dto/pagination.dto.js';
import { ApiResponseDto } from '../../../common/dto/api-response.dto.js';

export enum TransactionDateRange {
  LAST_30_DAYS = 'LAST_30_DAYS',
  ALL_TIME = 'ALL_TIME',
}

export enum TransactionAmountRange {
  ALL = 'ALL',
  UNDER_1000 = 'UNDER_1000',
  FROM_1000_TO_10000 = 'FROM_1000_TO_10000',
  OVER_10000 = 'OVER_10000',
}

export enum TransactionSortBy {
  CREATED_AT = 'createdAt',
  AMOUNT = 'amount',
  STATUS = 'status',
  TRANSACTION_NUMBER = 'transactionNumber',
}

export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
}

export class TransactionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Search transaction number, user name, or email',
    example: 'TXN-0017',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({
    enum: TransactionDateRange,
    default: TransactionDateRange.LAST_30_DAYS,
    example: TransactionDateRange.LAST_30_DAYS,
  })
  @IsOptional()
  @IsEnum(TransactionDateRange)
  dateRange = TransactionDateRange.LAST_30_DAYS;

  @ApiPropertyOptional({ format: 'date-time', example: '2026-09-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ format: 'date-time', example: '2026-09-30T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ enum: TransactionType, example: TransactionType.PAYMENT })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({ enum: TransactionStatus, example: TransactionStatus.SUCCESS })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiPropertyOptional({
    enum: TransactionAmountRange,
    default: TransactionAmountRange.ALL,
    example: TransactionAmountRange.ALL,
  })
  @IsOptional()
  @IsEnum(TransactionAmountRange)
  amount = TransactionAmountRange.ALL;

  @ApiPropertyOptional({
    enum: TransactionSortBy,
    default: TransactionSortBy.CREATED_AT,
    example: TransactionSortBy.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(TransactionSortBy)
  sortBy = TransactionSortBy.CREATED_AT;

  @ApiPropertyOptional({
    enum: SortDirection,
    default: SortDirection.DESC,
    example: SortDirection.DESC,
  })
  @IsOptional()
  @IsEnum(SortDirection)
  sortOrder = SortDirection.DESC;
}

export class CreateTransactionDto {
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    example: '01a0f3e5-3621-710e-8441-e73db8607562',
  })
  @IsOptional()
  @IsUUID('all')
  bookingId?: string | null;

  @ApiProperty({ enum: TransactionType, example: TransactionType.PAYMENT })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiProperty({ minimum: 0, maximum: 999999999999.99, example: 1250.5 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  amount: number;

  @ApiPropertyOptional({
    minLength: 3,
    maxLength: 3,
    default: 'INR',
    example: 'INR',
  })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency = 'INR';

  @ApiPropertyOptional({
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
    example: TransactionStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status = TransactionStatus.PENDING;
}

export class UpdateTransactionStatusDto {
  @ApiProperty({ enum: TransactionStatus })
  @IsEnum(TransactionStatus)
  status: TransactionStatus;
}

export class TransactionParamDto {
  @ApiProperty({
    description: 'Transaction UUID or public transaction number',
    example: 'TXN-0017',
  })
  @Matches(
    /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|TXN-[A-Z0-9-]{1,30})$/i,
  )
  id: string;
}

export class TransactionUserDto {
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

  @ApiProperty({ type: String, nullable: true, example: null })
  profileImage: string | null;
}

export class TransactionResponseDto {
  @ApiProperty({ format: 'uuid', example: '9b3f0e54-67ec-4cc6-a974-2918cb7cb581' })
  id: string;

  @ApiProperty({ example: 'TXN-0017' })
  transactionNumber: string;

  @ApiProperty({ enum: TransactionType, example: TransactionType.PAYMENT })
  type: TransactionType;

  @ApiProperty({ enum: TransactionStatus, example: TransactionStatus.SUCCESS })
  status: TransactionStatus;

  @ApiProperty({
    type: Number,
    description: 'Refund amounts are negative in this view.',
    example: 2499.5,
  })
  amount: number;

  @ApiProperty({ example: 'INR' })
  currency: string;

  @ApiProperty({ type: TransactionUserDto })
  user: TransactionUserDto;

  @ApiProperty({ type: String, nullable: true, example: 'BKG-0045' })
  bookingNumber: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-09-25T09:30:00.000Z' })
  createdAt: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-30T08:15:00.000Z' })
  updatedAt: string;
}

export class TransactionListCardsDto {
  @ApiProperty({ type: Number, example: 128 })
  totalTransactions: number;

  @ApiProperty({ type: Number, example: 2450.75 })
  averageTransactionAmount: number;

  @ApiProperty({ type: Number, example: 313696 })
  totalVolume: number;

  @ApiProperty({ type: Number, example: 87.5, description: 'Success rate as a percentage' })
  successRate: number;
}

export class TransactionInvoiceDetailsDto {
  @ApiProperty({ example: 'Refund' })
  transactionType: string;

  @ApiProperty({ type: String, nullable: true, example: 'Booking BKG-0045' })
  product: string | null;

  @ApiProperty({ type: Number, nullable: true, example: null })
  processingGatewayFee: number | null;

  @ApiProperty({ type: Number, example: 1250.5 })
  subtotal: number;

  @ApiProperty({ type: Number, example: -1250.5 })
  grandTotal: number;

  @ApiProperty({ example: 'INR' })
  currency: string;
}

export class TransactionCustomerProfileDto {
  @ApiProperty({ example: 'Visaj Panchal' })
  fullName: string;

  @ApiProperty({ type: String, format: 'email', nullable: true, example: 'visaj@gmail.com' })
  email: string | null;

  @ApiProperty({ format: 'uuid', example: '50a712d7-eb0b-42d6-9e42-35da3d519d3c' })
  userId: string;
}

export class TransactionProcessingHistoryDto {
  @ApiProperty({ example: 'Refunded' })
  status: string;

  @ApiProperty({ example: 'Transaction status is Refunded' })
  description: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-29T11:58:00.000Z' })
  timestamp: string;
}

export class TransactionDetailDto {
  @ApiProperty({ example: '#TXN-0017' })
  id: string;

  @ApiProperty({ example: 'Refunded' })
  status: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-29T11:58:00.000Z' })
  generatedAt: string;

  @ApiProperty({ type: TransactionInvoiceDetailsDto })
  invoiceDetails: TransactionInvoiceDetailsDto;

  @ApiProperty({ type: TransactionCustomerProfileDto })
  customerProfile: TransactionCustomerProfileDto;

  @ApiProperty({ type: [TransactionProcessingHistoryDto] })
  processingHistory: TransactionProcessingHistoryDto[];

}

export class TransactionDetailResponseDto {
  @ApiProperty({ type: TransactionDetailDto })
  transaction: TransactionDetailDto;
}

export class TransactionListResponseDto extends ApiResponseDto<
  TransactionResponseDto[],
  PaginationMetaDto,
  TransactionListCardsDto
> {
  @ApiProperty({ type: String, example: 'Transactions fetched successfully' })
  declare message?: string;

  @ApiProperty({ type: [TransactionResponseDto] })
  declare data: TransactionResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  declare meta: PaginationMetaDto;

  @ApiProperty({ type: TransactionListCardsDto })
  declare cards: TransactionListCardsDto;
}

export class TransactionResponseEnvelopeDto extends ApiResponseDto<TransactionResponseDto> {
  @ApiProperty({ type: String, example: 'Transaction request completed successfully' })
  declare message?: string;

  @ApiProperty({ type: TransactionResponseDto })
  declare data: TransactionResponseDto;
}

export class TransactionDetailEnvelopeDto extends ApiResponseDto<TransactionDetailResponseDto> {
  @ApiProperty({ type: String, example: 'Transaction details fetched successfully' })
  declare message?: string;

  @ApiProperty({ type: TransactionDetailResponseDto })
  declare data: TransactionDetailResponseDto;
}
