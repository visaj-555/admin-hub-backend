import { HttpStatus } from '@nestjs/common';
import { ApiException as BaseApiException } from './api-exception';

/**
 * Base API Exception class with i18n support
 */
export { BaseApiException as ApiException };

/**
 * Bad Request Exception (400)
 */
export class BadRequestException extends BaseApiException {
  constructor(
    errorCode = 'BAD_REQUEST',
    i18nKey = 'errors.badRequest',
    i18nArgs?: Record<string, unknown>,
  ) {
    super(HttpStatus.BAD_REQUEST, errorCode, i18nKey, i18nArgs);
  }
}

/**
 * Unauthorized Exception (401)
 */
export class UnauthorizedException extends BaseApiException {
  constructor(
    errorCode = 'UNAUTHORIZED',
    i18nKey = 'errors.unauthorized',
    i18nArgs?: Record<string, unknown>,
  ) {
    super(HttpStatus.UNAUTHORIZED, errorCode, i18nKey, i18nArgs);
  }
}

/**
 * Forbidden Exception (403)
 */
export class ForbiddenException extends BaseApiException {
  constructor(
    errorCode = 'FORBIDDEN',
    i18nKey = 'errors.forbidden',
    i18nArgs?: Record<string, unknown>,
  ) {
    super(HttpStatus.FORBIDDEN, errorCode, i18nKey, i18nArgs);
  }
}

/**
 * Not Found Exception (404)
 */
export class NotFoundException extends BaseApiException {
  constructor(
    errorCode = 'NOT_FOUND',
    i18nKey = 'errors.notFound',
    i18nArgs?: Record<string, unknown>,
  ) {
    super(HttpStatus.NOT_FOUND, errorCode, i18nKey, i18nArgs);
  }
}

/**
 * Conflict Exception (409)
 */
export class ConflictException extends BaseApiException {
  constructor(
    errorCode = 'CONFLICT',
    i18nKey = 'errors.conflict',
    i18nArgs?: Record<string, unknown>,
  ) {
    super(HttpStatus.CONFLICT, errorCode, i18nKey, i18nArgs);
  }
}

/**
 * Too Many Requests Exception (429)
 */
export class TooManyRequestsException extends BaseApiException {
  constructor(
    errorCode = 'TOO_MANY_REQUESTS',
    i18nKey = 'errors.tooManyRequests',
    i18nArgs?: Record<string, unknown>,
  ) {
    super(HttpStatus.TOO_MANY_REQUESTS, errorCode, i18nKey, i18nArgs);
  }
}

/**
 * Unprocessable Entity Exception (422)
 */
export class UnprocessableEntityException extends BaseApiException {
  constructor(
    errorCode = 'UNPROCESSABLE_ENTITY',
    i18nKey = 'errors.unprocessableEntity',
    i18nArgs?: Record<string, unknown>,
  ) {
    super(HttpStatus.UNPROCESSABLE_ENTITY, errorCode, i18nKey, i18nArgs);
  }
}

/**
 * Service Unavailable Exception (503)
 */
export class ServiceUnavailableException extends BaseApiException {
  constructor(
    errorCode = 'SERVICE_UNAVAILABLE',
    i18nKey = 'errors.serviceUnavailable',
    i18nArgs?: Record<string, unknown>,
  ) {
    super(HttpStatus.SERVICE_UNAVAILABLE, errorCode, i18nKey, i18nArgs);
  }
}

/**
 * Internal Server Error Exception (500)
 */
export class InternalServerErrorException extends BaseApiException {
  constructor(
    errorCode = 'INTERNAL_SERVER_ERROR',
    i18nKey = 'errors.internalServerError',
    i18nArgs?: Record<string, unknown>,
  ) {
    super(HttpStatus.INTERNAL_SERVER_ERROR, errorCode, i18nKey, i18nArgs);
  }
}
