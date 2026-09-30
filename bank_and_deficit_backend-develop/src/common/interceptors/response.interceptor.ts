import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../dto/api-response.dto';

/**
 * Global response interceptor
 * Automatically wraps all successful responses in ApiResponse format
 */
@Injectable()
export class ResponseInterceptor<T = unknown> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    const http = context.switchToHttp();
    const response = http.getResponse<Response>();
    const statusCode: number = response.statusCode ?? 200;

    return next.handle().pipe(
      map((data: T) => {
        // If response is already an ApiResponse, return as is
        if (data instanceof ApiResponse) {
          return data as ApiResponse<T>;
        }

        // Default success response
        return ApiResponse.success<T>(data, 'Success', statusCode);
      }),
    );
  }
}
