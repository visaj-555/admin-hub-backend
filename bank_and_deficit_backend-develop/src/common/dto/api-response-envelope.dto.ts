import { Type } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiErrorDto } from './api-error.dto';

/**
 * Base Swagger envelope for all API responses.
 * Use {@link createApiResponseDto} for endpoint-specific typed `data` schemas.
 */
export class ApiResponseDto<T = unknown> {
  @ApiProperty({
    description: 'Indicates if the request was successful',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'HTTP status code',
    example: 200,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Response message',
    example: 'Success',
  })
  message: string;

  @ApiProperty({
    description: 'Response payload',
    required: false,
  })
  data?: T;

  @ApiPropertyOptional({
    description: 'Additional metadata (e.g. pagination)',
  })
  meta?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Error details when success is false',
    type: ApiErrorDto,
  })
  error?: ApiErrorDto;
}

/**
 * Creates a concrete Swagger response DTO with a typed `data` property.
 */
export function createApiResponseDto<TData extends Type>(
  dataType: TData,
  options?: { nullableData?: boolean },
): Type<ApiResponseDto<InstanceType<TData> | null>> {
  const isNullable = options?.nullableData ?? false;

  class TypedApiResponseDto extends ApiResponseDto<InstanceType<TData> | null> {
    @ApiProperty({
      type: dataType,
      nullable: isNullable,
      required: !isNullable,
      ...(isNullable ? { example: null } : {}),
    })
    declare data: InstanceType<TData> | null;
  }

  Object.defineProperty(TypedApiResponseDto, 'name', {
    value: `ApiResponse_${dataType.name}`,
    writable: false,
  });

  return TypedApiResponseDto;
}

/** Standard envelope when `data` is explicitly null. */
export class EmptyDataApiResponseDto extends ApiResponseDto<null> {
  @ApiProperty({
    description: 'Response payload',
    nullable: true,
    example: null,
  })
  declare data: null;
}
