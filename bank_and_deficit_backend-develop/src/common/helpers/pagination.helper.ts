import { PaginationDto } from '../dto/pagination.dto';
import { PaginationMeta } from '../interfaces/pagination.interface';

export function calculatePaginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPreviousPage = page > 1;

  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage,
    hasPreviousPage,
  };
}

export function getPaginationParams(dto: PaginationDto): {
  page: number;
  limit: number;
  skip: number;
} {
  const page = dto.page ?? 1;
  const limit = dto.limit ?? 10;
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}
