import { Type } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { createApiResponseDto } from '../dto/api-response-envelope.dto';
import { PaginationMetaDto } from '../dto/pagination-meta.dto';

/**
 * Creates a paginated `data` DTO for Swagger documentation.
 */
export function createPaginatedDataDto<TItem extends Type>(itemType: TItem) {
  class PaginatedDataDto {
    @ApiProperty({ type: itemType, isArray: true })
    items: InstanceType<TItem>[];

    @ApiProperty({ type: PaginationMetaDto })
    pagination: PaginationMetaDto;
  }

  Object.defineProperty(PaginatedDataDto, 'name', {
    value: `PaginatedData_${itemType.name}`,
    writable: false,
  });

  return PaginatedDataDto;
}

/**
 * Creates a full API response DTO for paginated list endpoints.
 */
export function createPaginatedApiResponseDto<TItem extends Type>(
  itemType: TItem,
) {
  return createApiResponseDto(createPaginatedDataDto(itemType));
}
