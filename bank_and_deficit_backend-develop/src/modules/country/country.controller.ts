import { Controller, Get, Query } from '@nestjs/common';
import { CountryService } from './country.service';
import { I18n, I18nContext } from 'nestjs-i18n';
import { ApiResponse } from 'src/common/common.exports';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ViewAllCountriesResponseDto } from './dto/country.dto';

@ApiTags('Countries')
@Controller('country')
export class CountryController {
  constructor(private readonly countryService: CountryService) {}

  @Get('viewAll')
  @ApiOperation({ summary: 'Get all countries (with search)' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiOkResponse({
    description: 'Countries fetched successfully',
    type: ViewAllCountriesResponseDto,
  })
  async findAll(
    @I18n() i18n: I18nContext,
    @Query('search') search?: string,
  ): Promise<ViewAllCountriesResponseDto> {
    const countries = await this.countryService.findAll(search);

    return ApiResponse.success(
      countries,
      i18n.t('country.success.fetched'),
    ) as ViewAllCountriesResponseDto;
  }
}
