import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export interface ApiError {
    code?: string;
    details?: unknown;
}

export class ApiResponse<T> {
    success: boolean;
    statusCode: number;
    message: string;
    data?: T;
    meta?: Record<string, unknown>;
    cards?: Record<string, unknown>;
    analysis?: Record<string, unknown>;
    bookingsSummary?: Record<string, unknown>;
    error?: ApiError;
    timestamp?: string;
    path?: string;

    constructor(
        success: boolean,
        statusCode: number,
        message: string,
        data?: T,
        meta?: Record<string, unknown>,
        cards?: Record<string, unknown>,
        analysis?: Record<string, unknown>,
        bookingsSummary?: Record<string, unknown>,
        error?: ApiError,
        timestamp?: string,
        path?: string,
    ) {
        this.success = success;
        this.statusCode = statusCode;
        this.message = message;
        this.data = data;
        this.meta = meta;
        this.cards = cards;
        this.analysis = analysis;
        this.bookingsSummary = bookingsSummary;
        this.error = error;
        this.timestamp = timestamp;
        this.path = path;
    }

    static success<T>(
        data: T,
        message = 'Request completed successfully',
        statusCode = 200,
        meta?: Record<string, unknown>,
        cards?: Record<string, unknown>,
        analysis?: Record<string, unknown>,
        bookingsSummary?: Record<string, unknown>,
    ): ApiResponse<T> {
        return new ApiResponse(
            true,
            statusCode,
            message,
            data,
            meta,
            cards,
            analysis,
            bookingsSummary,
        );
    }

    static error<T = null>(
        message: string,
        statusCode = 500,
        errorCode?: string,
        errorDetails?: unknown,
        path?: string,
    ): ApiResponse<T> {
        return new ApiResponse<T>(
            false,
            statusCode,
            message,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            {
                code: errorCode,
                details: errorDetails,
            },
            new Date().toISOString(),
            path,
        );
    }
}

export class ApiErrorDto {
    @ApiPropertyOptional()
    code?: string;

    @ApiPropertyOptional()
    details?: unknown;
}

export class ApiResponseDto<
    TData = unknown,
    TMeta = Record<string, unknown>,
    TCards = Record<string, unknown>,
    TAnalysis = Record<string, unknown>,
    TBookingsSummary = Record<string, unknown>,
> {
    @ApiProperty({ type: Boolean, example: true })
    success?: boolean;

    @ApiProperty({ type: Number, example: 200 })
    statusCode?: number;

    @ApiProperty({ type: String, example: 'Request completed successfully' })
    message?: string;

    @ApiPropertyOptional({ description: 'Response payload' })
    data?: TData;

    @ApiPropertyOptional({
        description: 'Additional metadata, such as pagination',
        type: Object,
    })
    meta?: TMeta;

    @ApiPropertyOptional({ description: 'Summary metrics for list responses' })
    cards?: TCards;

    @ApiPropertyOptional({ description: 'Analysis summary for list responses' })
    analysis?: TAnalysis;

    @ApiPropertyOptional({ description: 'Booking status summary and month-over-month changes' })
    bookingsSummary?: TBookingsSummary;

    @ApiPropertyOptional({ type: ApiErrorDto })
    error?: ApiErrorDto;

    @ApiPropertyOptional({ format: 'date-time' })
    timestamp?: string;

    @ApiPropertyOptional({ example: '/users' })
    path?: string;
}