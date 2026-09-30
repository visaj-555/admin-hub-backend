import { ConflictException } from '../exceptions';

/**
 * Field error mapping type for unique constraint violations
 */
export type FieldErrorMap = Record<
  string,
  { errorCode: string; i18nKey: string }
>;

/**
 * Handles Prisma unique constraint violations and throws appropriate ConflictException
 *
 * @param error - The caught error from Prisma operation
 * @param fieldErrorMap - Map of field names to error codes and i18n keys
 * @throws ConflictException if a unique constraint violation is detected and mapped
 * @throws The original error if it's not a handled unique constraint error
 *
 * @example
 * ```typescript
 * try {
 *   await prisma.user.update({ where: { id }, data: { panNo } });
 * } catch (error) {
 *   handleUniqueConstraintError(error, {
 *     panNo: {
 *       errorCode: 'PAN_NO_ALREADY_EXISTS',
 *       i18nKey: 'auth.errors.panNoAlreadyExists',
 *     },
 *   });
 * }
 * ```
 */

export function handleUniqueConstraintError(
  error: unknown,
  fieldErrorMap: FieldErrorMap,
): never {
  if (!error || typeof error !== 'object') {
    throw error;
  }

  const errorObj = error as {
    code?: string;
    meta?: { target?: string[] | string };
    message?: string;
  };

  // Detect Prisma unique constraint error
  const isUniqueConstraintError =
    errorObj.code === 'P2002' ||
    (errorObj.message?.toLowerCase().includes('unique constraint') ?? false);

  if (isUniqueConstraintError) {
    let targetFields: string[] = [];

    // Extract from meta.target
    if (errorObj.meta?.target) {
      if (Array.isArray(errorObj.meta.target)) {
        targetFields = errorObj.meta.target;
      } else if (typeof errorObj.meta.target === 'string') {
        targetFields = [errorObj.meta.target];
      }
    }

    //  Fallback: extract from message
    if (targetFields.length === 0 && errorObj.message) {
      const patterns = [
        /fields: \(`"(\w+)"`\)/,
        /fields: \(`(\w+)`\)/,
        /Unique constraint.*?\(`"(\w+)"`\)/,
        /constraint.*?\(`"(\w+)"`\)/,
        /\(`"(\w+)"`\)/,
      ];

      for (const pattern of patterns) {
        const match = errorObj.message.match(pattern);
        if (match && match[1]) {
          targetFields = [match[1]];
          break;
        }
      }
    }

    // Normalize + match fields
    for (const field of targetFields) {
      const normalizedField = field
        .replace(/.*\./, '') // remove table prefix
        .replace(/_key$/, '') // remove "_key"
        .split('_')
        .filter(Boolean)
        .pop(); // get actual field name

      if (!normalizedField) continue;

      const fieldError = fieldErrorMap[normalizedField];

      if (fieldError) {
        throw new ConflictException(fieldError.errorCode, fieldError.i18nKey);
      }
    }

    // Fallback if no specific field matched
    throw new ConflictException(
      'UNIQUE_CONSTRAINT_FAILED',
      'errors.uniqueConstraintFailed',
    );
  }

  // Not a handled error → rethrow safely
  if (error instanceof Error) {
    throw error;
  }

  throw new Error(
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message)
      : 'Unknown error occurred',
  );
}
