import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export function AtLeastOneField(validationOptions?: ValidationOptions) {
  return function (constructor: new (...args: unknown[]) => unknown) {
    registerDecorator({
      name: 'atLeastOneField',
      target: constructor,
      propertyName: '',
      options: validationOptions,
      validator: {
        validate(_: unknown, args: ValidationArguments) {
          const obj = args.object as Record<string, unknown>;
          return (
            obj.dailyPostLimit !== undefined ||
            obj.captionGenerationLimit !== undefined
          );
        },
        defaultMessage() {
          return 'At least one of dailyPostLimit or captionGenerationLimit must be provided';
        },
      },
    });
  };
}
