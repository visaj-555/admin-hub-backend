import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Prisma } from '../../generated/prisma/client.js';
import { ApiResponse } from '../dto/api-response.dto.js';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const context = host.switchToHttp();
    const request = context.getRequest<Record<string, unknown>>();
    const mapped = this.mapException(exception);
    const message = Array.isArray(mapped.message)
      ? 'Validation failed'
      : mapped.message;
    const details = Array.isArray(mapped.message) ? mapped.message : undefined;
    const path = String(httpAdapter.getRequestUrl(request));

    if (mapped.statusCode >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body = ApiResponse.error(
      message,
      mapped.statusCode,
      mapped.error,
      details,
      path,
    );

    httpAdapter.reply(context.getResponse(), body, mapped.statusCode);
  }

  private mapException(exception: unknown): {
    statusCode: number;
    error: string;
    message: string | string[];
  } {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.mapPrismaError(exception);
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : typeof response === 'object' &&
              response !== null &&
              'message' in response
            ? response.message
            : exception.message;

      return {
        statusCode,
        error: HttpStatus[statusCode] ?? 'Error',
        message:
          typeof message === 'string' ||
          (Array.isArray(message) &&
            message.every((item) => typeof item === 'string'))
            ? message
            : exception.message,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    };
  }

  private mapPrismaError(exception: Prisma.PrismaClientKnownRequestError): {
    statusCode: number;
    error: string;
    message: string;
  } {
    if (exception.code === 'P2002') {
      return {
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: this.uniqueConstraintMessage(exception),
      };
    }

    if (exception.code === 'P2025') {
      return {
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        message: 'Record not found',
      };
    }

    if (exception.code === 'P2003' || exception.code === 'P2014') {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Related record does not exist',
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Database operation failed',
    };
  }

  private uniqueConstraintMessage(
    exception: Prisma.PrismaClientKnownRequestError,
  ): string {
    const target = Array.isArray(exception.meta?.target)
      ? exception.meta.target.map(String)
      : [];

    if (target.some((field) => field.toLowerCase().includes('email'))) {
      return 'Email already exists';
    }
    if (target.some((field) => field.toLowerCase().includes('phone'))) {
      return 'Phone number already exists';
    }
    if (target.some((field) => field.toLowerCase().includes('bookingnumber'))) {
      return 'Booking number already exists';
    }
    if (
      target.some((field) => field.toLowerCase().includes('transactionnumber'))
    ) {
      return 'Transaction number already exists';
    }

    return 'A record with the provided data already exists';
  }
}
