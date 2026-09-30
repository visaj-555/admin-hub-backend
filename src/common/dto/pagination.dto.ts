import {
  ApiHideProperty,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (starts at 1)',
    minimum: 1,
    default: 1,
    example: 1,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    minimum: 1,
    maximum: 100,
    default: 10,
    example: 10,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;

  @ApiHideProperty()
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class DateFilterQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    format: 'date-time',
    example: '2026-09-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    example: '2026-09-30T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}

export class PaginationMetaDto {
  @ApiProperty({ description: 'Current page number', example: 1, type: Number })
  page: number;

  @ApiProperty({
    description: 'Number of items per page',
    example: 10,
    type: Number,
  })
  limit: number;

  @ApiProperty({ description: 'Total matching items', example: 23, type: Number })
  total: number;

  @ApiProperty({ description: 'Total number of pages', example: 3, type: Number })
  totalPages: number;

  @ApiProperty({ description: 'Whether a next page exists', example: true })
  hasNextPage: boolean;

  @ApiProperty({ description: 'Whether a previous page exists', example: false })
  hasPreviousPage: boolean;
}

export function paginationMeta(
  page: number,
  limit: number,
  total: number,
): PaginationMetaDto {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

export function getPaginationParams(dto: PaginationQueryDto): {
  page: number;
  limit: number;
  skip: number;
} {
  const page = dto.page ?? 1;
  const limit = dto.pageSize ?? dto.limit ?? 10;
  return { page, limit, skip: (page - 1) * limit };
}
