import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export function MaxCharacters(
  maxLength: number,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'maxCharacters',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [maxLength],
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (typeof value !== 'string') return false;

          return value.length <= args.constraints[0];
        },
      },
    });
  };
}
