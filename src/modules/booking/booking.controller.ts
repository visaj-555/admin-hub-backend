import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';
import {
  BookingDetailEnvelopeDto,
  BookingListResponseDto,
  BookingParamDto,
  BookingResponseEnvelopeDto,
  BookingsQueryDto,
  CreateBookingDto,
  UpdateBookingDto,
} from './dto/booking.dto.js';
import { BookingService } from './booking.service.js';

@ApiTags('Bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingsService: BookingService) { }

  @Get()
  @ResponseMessage('Bookings fetched successfully')
  @ApiOperation({
    summary: 'List bookings with search, filters, sorting, and pagination',
  })
  @ApiOkResponse({ type: BookingListResponseDto })
  list(@Query() query: BookingsQueryDto): Promise<BookingListResponseDto> {
    return this.bookingsService.list(query);
  }

  @Get(':id')
  @ResponseMessage('Booking details fetched successfully')
  @ApiOperation({ summary: 'Get a booking by UUID or booking number' })
  @ApiOkResponse({ type: BookingDetailEnvelopeDto })
  get(@Param() params: BookingParamDto): Promise<BookingDetailEnvelopeDto> {
    return this.bookingsService.get(params.id);
  }

  @Post()
  @ResponseMessage('Booking created successfully')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a booking' })
  @ApiOkResponse({ type: BookingResponseEnvelopeDto })
  create(
    @Body() input: CreateBookingDto,
  ): Promise<BookingResponseEnvelopeDto> {
    return this.bookingsService.create(input);
  }

  @Patch(':id')
  @ResponseMessage('Booking updated successfully')
  @ApiOperation({ summary: 'Update a booking' })
  @ApiOkResponse({ type: BookingResponseEnvelopeDto })
  update(
    @Param() params: BookingParamDto,
    @Body() input: UpdateBookingDto,
  ): Promise<BookingResponseEnvelopeDto> {
    return this.bookingsService.update(params.id, input);
  }
}
