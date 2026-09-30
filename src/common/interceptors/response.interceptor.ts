import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { map, type Observable } from 'rxjs';
import { RESPONSE_MESSAGE_METADATA } from '../decorators/response-message.decorator.js';
import { ApiResponse } from '../dto/api-response.dto.js';

type ExistingResponseEnvelope = {
    data: unknown;
    meta?: Record<string, unknown>;
    cards?: Record<string, unknown>;
    analysis?: Record<string, unknown>;
    bookingsSummary?: Record<string, unknown>;
};

@Injectable()
export class ResponseInterceptor<T = unknown> implements NestInterceptor<
    T,
    ApiResponse<unknown>
> {
    constructor(private readonly reflector: Reflector) { }

    intercept(
        context: ExecutionContext,
        next: CallHandler<T>,
    ): Observable<ApiResponse<unknown>> {
        const response = context.switchToHttp().getResponse<Response>();
        const message =
            this.reflector.get<string>(
                RESPONSE_MESSAGE_METADATA,
                context.getHandler(),
            ) ?? 'Request completed successfully';

        return next.handle().pipe(
            map((result: T) => {
                if (result instanceof ApiResponse) {
                    return result;
                }

                const statusCode = response.statusCode || 200;
                if (this.isExistingEnvelope(result)) {
                    return ApiResponse.success(
                        result.data,
                        message,
                        statusCode,
                        result.meta,
                        result.cards,
                        result.analysis,
                        result.bookingsSummary,
                    );
                }

                return ApiResponse.success(result, message, statusCode);
            }),
        );
    }

    private isExistingEnvelope(value: unknown): value is ExistingResponseEnvelope {
        if (typeof value !== 'object' || value === null || !('data' in value)) {
            return false;
        }

        return Object.keys(value).every(
            (key) =>
                key === 'data' ||
                key === 'meta' ||
                key === 'cards' ||
                key === 'analysis' ||
                key === 'bookingsSummary',
        );
    }
}