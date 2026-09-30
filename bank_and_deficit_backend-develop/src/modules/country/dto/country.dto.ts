// country-response.dto.ts

import { ApiProperty } from '@nestjs/swagger';

export class CountryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  iso2: string;

  @ApiProperty()
  iso3: string;

  @ApiProperty()
  phoneCode: string;

  @ApiProperty()
  minLength: number;

  @ApiProperty()
  maxLength: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ViewAllCountriesResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({
    example: 'Countries fetched successfully',
  })
  message: string;

  @ApiProperty({
    type: [CountryDto],
  })
  data: CountryDto[];
}
