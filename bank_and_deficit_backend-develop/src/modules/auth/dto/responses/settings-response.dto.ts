import { ApiProperty } from '@nestjs/swagger';

export class UpdateSettingsResponseDataDto {
  @ApiProperty()
  isPrivate: boolean;
}
