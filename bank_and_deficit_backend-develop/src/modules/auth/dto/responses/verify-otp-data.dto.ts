import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDataDto {
  @ApiProperty({
    example: '019b3b95-9c4d-70ac-a228-903e54f13c95',
  })
  id: string;
}
