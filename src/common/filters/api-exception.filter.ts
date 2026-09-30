import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Prisma } from '../../generated/prisma/client.js';
import { ApiResponse } from '../dto/api-response.dto.js';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly adapterHost: HttpAdapterHost) { }

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const context = host.switchToHttp();
    const mapped = this.mapException(exception);
    const message = Array.isArray(mapped.message)
      ? 'Validation failed'
      : mapped.message;
    const details = Array.isArray(mapped.message) ? mapped.message : undefined;
    const body = ApiResponse.error(
      message,
      mapped.statusCode,
      mapped.error,
      details,
    );
    httpAdapter.reply(context.getResponse(), body, mapped.statusCode);
  }

  private mapException(exception: unknown): {
    statusCode: number;
    error: string;
    message: string | string[];
  } {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          statusCode: 409,
          error: 'Conflict',
          message: 'Record already exists',
        };
      }
      if (exception.code === 'P2025') {
        return {
          statusCode: 404,
          error: 'Not Found',
          message: 'Record not found',
        };
      }
      if (exception.code === 'P2003') {
        return {
          statusCode: 409,
          error: 'Conflict',
          message: 'Related record prevents this operation',
        };
      }
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
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    };
  }
}
