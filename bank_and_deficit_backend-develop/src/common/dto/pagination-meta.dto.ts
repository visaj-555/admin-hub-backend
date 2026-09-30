import { ApiProperty } from '@nestjs/swagger';

/**
 * Pagination metadata DTO for Swagger documentation
 * This class is used to generate consistent Swagger schemas for pagination
 */
export class PaginationMetaDto {
  @ApiProperty({
    description: 'Current page number',
    example: 1,
    type: Number,
  })
  page: number;

  @ApiProperty({
    description: 'Number of items per page',
    example: 10,
    type: Number,
  })
  limit: number;

  @ApiProperty({
    description: 'Total number of items',
    example: 100,
    type: Number,
  })
  total: number;

  @ApiProperty({
    description: 'Total number of pages',
    example: 10,
    type: Number,
  })
  totalPages: number;

  @ApiProperty({
    description: 'Whether there is a next page',
    example: true,
    type: Boolean,
  })
  hasNextPage: boolean;

  @ApiProperty({
    description: 'Whether there is a previous page',
    example: false,
    type: Boolean,
  })
  hasPreviousPage: boolean;
}
