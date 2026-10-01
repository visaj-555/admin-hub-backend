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
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface.js';
import {
  CreateTransactionDto,
  TransactionListResponseDto,
  TransactionDetailEnvelopeDto,
  TransactionParamDto,
  TransactionResponseEnvelopeDto,
  TransactionsQueryDto,
  UpdateTransactionStatusDto,
} from './dto/transaction.dto.js';
import { TransactionService } from './transaction.service.js';

@ApiTags('Transactions')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactionsService: TransactionService) { }

  @Get()
  @ResponseMessage('Transactions fetched successfully')
  @ApiOperation({
    summary: 'List transactions with search, filters, sorting, and pagination',
  })
  @ApiOkResponse({ type: TransactionListResponseDto })
  list(
    @Query() query: TransactionsQueryDto,
  ): Promise<TransactionListResponseDto> {
    return this.transactionsService.list(query);
  }

  @Get(':id')
  @ResponseMessage('Transaction details fetched successfully')
  @ApiOperation({ summary: 'Get a transaction by UUID or transaction number' })
  @ApiOkResponse({ type: TransactionDetailEnvelopeDto })
  get(
    @Param() params: TransactionParamDto,
  ): Promise<TransactionDetailEnvelopeDto> {
    return this.transactionsService.get(params.id);
  }

  @Post()
  @ResponseMessage('Transaction created successfully')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a transaction' })
  @ApiBody({
    type: CreateTransactionDto,
    examples: {
      payment: {
        summary: 'Create a payment transaction',
        value: {
          bookingId: '01a0f3e5-3621-710e-8441-e73db8607562',
          type: 'PAYMENT',
          amount: 1250.5,
          currency: 'INR',
          status: 'PENDING',
        },
      },
    },
  })
  @ApiOkResponse({ type: TransactionResponseEnvelopeDto })
  create(
    @Body() input: CreateTransactionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TransactionResponseEnvelopeDto> {
    return this.transactionsService.create(input, user.sub);
  }

  @Patch(':id/status')
  @ResponseMessage('Transaction status updated successfully')
  @ApiOperation({ summary: 'Update transaction status' })
  @ApiOkResponse({ type: TransactionResponseEnvelopeDto })
  updateStatus(
    @Param() params: TransactionParamDto,
    @Body() input: UpdateTransactionStatusDto,
  ): Promise<TransactionResponseEnvelopeDto> {
    return this.transactionsService.updateStatus(params.id, input);
  }
}
