import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base API Exception class with i18n support
 * All custom exceptions should extend this class
 */
export class ApiException extends HttpException {
  public readonly errorCode?: string;
  public readonly i18nKey?: string;
  public readonly i18nArgs?: Record<string, unknown>;

  constructor(
    status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    errorCode?: string,
    i18nKey?: string,
    i18nArgs?: Record<string, unknown>,
  ) {
    // ❗ Neutral internal message
    super('API_EXCEPTION', status);

    this.errorCode = errorCode;
    this.i18nKey = i18nKey;
    this.i18nArgs = i18nArgs;
  }
}
