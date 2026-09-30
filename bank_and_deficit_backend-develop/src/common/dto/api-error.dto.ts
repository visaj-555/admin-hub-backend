import { ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorDto {
  @ApiPropertyOptional({
    description: 'HTTP error name',
    example: 'Bad Request',
  })
  code?: string;

  @ApiPropertyOptional({
    description: 'Additional error details',
    example: ['Email must be a valid email address'],
    type: [String],
  })
  details?: unknown;
}
