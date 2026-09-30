// ============== API SUCCESS RESPONSE (runtime) ============== //

export class ApiResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
  meta?: Record<string, unknown>;
  error?: ApiError;

  constructor(
    success: boolean,
    statusCode: number,
    message: string,
    data?: T,
    meta?: Record<string, unknown>,
    error?: ApiError,
  ) {
    this.success = success;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
    this.meta = meta;
    this.error = error;
  }

  /* -------------------- Static helpers -------------------- */

  static success<T>(
    data: T,
    message = 'Success',
    statusCode = 200,
    meta?: Record<string, unknown>,
  ): ApiResponse<T> {
    return new ApiResponse(true, statusCode, message, data, meta);
  }

  static error<T = null>(
    message: string,
    statusCode = 500,
    errorCode?: string,
    errorDetails?: unknown,
  ): ApiResponse<T> {
    return new ApiResponse<T>(
      false,
      statusCode,
      message,
      undefined,
      undefined,
      {
        code: errorCode,
        details: errorDetails,
      },
    );
  }

  static created<T>(
    data: T,
    message = 'Resource created successfully',
  ): ApiResponse<T> {
    return new ApiResponse(true, 201, message, data);
  }

  static noContent(message = 'No content'): ApiResponse<null> {
    return new ApiResponse(true, 204, message);
  }
}

// ============== API ERROR RESPONSE (runtime) ============== //

export interface ApiError {
  code?: string;
  details?: unknown;
}
