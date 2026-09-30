import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString } from 'class-validator';

export class ToggleCheerDto {
  @ApiProperty({
    example: 'cmej2k4l00001abc123xyz',
  })
  @IsString()
  postId: string;

  @ApiProperty({
    example: true,
  })
  @IsBoolean()
  isCheered: boolean;
}
