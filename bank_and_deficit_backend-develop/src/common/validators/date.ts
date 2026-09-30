import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

@ValidatorConstraint({ name: 'IsStrictDate', async: false })
export class IsStrictDateConstraint implements ValidatorConstraintInterface {
  validate(value: string): boolean {
    if (typeof value !== 'string') return false;

    // Strict YYYY-MM-DD format
    const regex = /^\d{4}-(\d{2})-(\d{2})$/;
    const match = value.match(regex);
    if (!match) return false;

    const year = Number(value.substring(0, 4));
    const month = Number(match[1]);
    const day = Number(match[2]);

    // Month range check
    if (month < 1 || month > 12) return false;

    // Create date object
    const date = new Date(year, month - 1, day);

    // Validate real calendar date
    return (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    );
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'Date must be a valid calendar date in format YYYY-MM-DD';
  }
}

export function IsStrictDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsStrictDateConstraint,
    });
  };
}
