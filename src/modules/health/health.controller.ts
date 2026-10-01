import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';

class HealthStatusDto {
  status!: string;
}

@ApiTags('Health')
@Controller()
export class HealthController {
  @Public()
  @Get('health')
  @ResponseMessage('AdminHub API is running')
  @ApiOperation({ summary: 'Service health check' })
  @ApiOkResponse({ type: HealthStatusDto })
  check(): HealthStatusDto {
    return { status: 'ok' };
  }
}
