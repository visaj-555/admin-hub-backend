import { applyDecorators } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

export function ApiLanguageHeader() {
  return applyDecorators(
    ApiHeader({
      name: 'Accept-Language',
      required: false,
      description: 'Language code (en, hi, fr)',
    }),
  );
}
