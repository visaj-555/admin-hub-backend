import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

function toPrivacyFlag(value: unknown): unknown {
  if (value === true || value === 1 || value === '1' || value === 'true') {
    return true;
  }

  if (value === false || value === 0 || value === '0' || value === 'false') {
    return false;
  }

  return value;
}

export class UpdateSettingsDto {
  @ApiPropertyOptional({
    description: 'Privacy status of the user account',
    example: true,
  })
  @IsOptional()
  @Transform(
    ({ obj }: { obj?: { isPrivate?: unknown } }) =>
      toPrivacyFlag(obj?.isPrivate),
    { toClassOnly: true },
  )
  @IsBoolean({
    message: 'auth.validation.is_private_boolean',
  })
  isPrivate?: boolean;
}
