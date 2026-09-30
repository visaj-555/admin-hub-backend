import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ApiResponseDto } from '../../../common/dto/api-response.dto.js';

export enum DashboardChartPeriod {
  DAYS_7 = '7D',
  MONTH_1 = '1M',
  MONTHS_3 = '3M',
  MONTHS_6 = '6M',
  YEAR_1 = '1Y',
}

export class DashboardStatsDto {
  @ApiProperty({
    description: 'Current registered users and month-over-month signup change.',
  })
  totalUsers: number;

  @ApiProperty({
    description: 'Active users, excluding soft-deleted accounts.',
  })
  activeUsers: number;

  @ApiProperty({
    description: 'New users created during the current calendar month.',
  })
  newUsersThisMonth: number;

  @ApiProperty({
    description: 'Net successful payment revenue after successful refunds.',
  })
  totalRevenue: number;

  @ApiProperty({ example: 'INR' })
  currency: string;

  @ApiProperty({
    description: 'Bookings whose status is pending or confirmed.',
  })
  activeBookings: number;

  @ApiProperty({
    description: 'Transactions with pending or processing status.',
  })
  pendingTransactions: number;

  @ApiProperty({
    type: Number,
    example: 0,
    nullable: true,
    description:
      'New-user percentage change vs. the prior month; null if the prior month was zero.',
  })
  usersChangePercent: number | null;

  @ApiProperty({
    type: Number,
    example: 0,
    nullable: true,
    description:
      'Net monthly revenue change vs. the prior month; null if the prior month was zero.',
  })
  revenueChangePercent: number | null;

  @ApiProperty({
    type: Number,
    example: 0,
    nullable: true,
    description:
      'Active booking creation change vs. the prior month; null if the prior month was zero.',
  })
  bookingsChangePercent: number | null;

  @ApiProperty({
    type: Number,
    example: 0,
    nullable: true,
    description:
      'Pending transaction creation change vs. the prior month; null if the prior month was zero.',
  })
  pendingTransactionsChangePercent: number | null;

  @ApiProperty({ format: 'date-time' })
  asOf: string;
}

export class DashboardStatsResponseDto extends ApiResponseDto<DashboardStatsDto> {
  @ApiProperty({ type: String, example: 'Dashboard stats fetched successfully' })
  declare message?: string;

  @ApiProperty({ type: DashboardStatsDto })
  declare data: DashboardStatsDto;
}

export class DashboardChartQueryDto {
  @ApiPropertyOptional({
    enum: DashboardChartPeriod,
    default: DashboardChartPeriod.MONTHS_6,
  })
  @IsOptional()
  @IsEnum(DashboardChartPeriod)
  period = DashboardChartPeriod.MONTHS_6;
}

export class DashboardChartPointDto {
  @ApiProperty({ example: '2026-09-01' })
  date: string;

  @ApiProperty({ example: 'Sep 2026' })
  label: string;

  @ApiProperty({
    description: 'Successful payment amount minus successful refund amount.',
  })
  revenue: number;

  @ApiProperty()
  payments: number;

  @ApiProperty()
  refunds: number;

  @ApiProperty()
  transactionCount: number;
}

export class DashboardChartsDto {
  @ApiProperty({ enum: DashboardChartPeriod })
  period: DashboardChartPeriod;

  @ApiProperty({ example: 'INR' })
  currency: string;

  @ApiProperty({ format: 'date-time' })
  from: string;

  @ApiProperty({ format: 'date-time' })
  to: string;

  @ApiProperty({ type: [DashboardChartPointDto] })
  points: DashboardChartPointDto[];
}

export class DashboardChartsResponseDto extends ApiResponseDto<DashboardChartsDto> {
  @ApiProperty({ type: String, example: 'Dashboard charts fetched successfully' })
  declare message?: string;

  @ApiProperty({ type: DashboardChartsDto })
  declare data: DashboardChartsDto;
}

export class DashboardAlertDto {
  @ApiProperty({ example: 'pending-transactions' })
  id: string;

  @ApiProperty({ enum: ['info', 'warning', 'critical'] })
  severity: 'info' | 'warning' | 'critical';

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  count: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '',
  })
  occurredAt: string | null;
}

export class DashboardAlertsResponseDto extends ApiResponseDto<DashboardAlertDto[]> {
  @ApiProperty({ type: String, example: 'Dashboard alerts fetched successfully' })
  declare message?: string;

  @ApiProperty({ type: [DashboardAlertDto] })
  declare data: DashboardAlertDto[];
}
