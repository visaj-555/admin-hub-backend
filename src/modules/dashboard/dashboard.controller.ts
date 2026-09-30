import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  DashboardAlertsResponseDto,
  DashboardChartQueryDto,
  DashboardChartsResponseDto,
  DashboardStatsResponseDto,
} from './dto/dashboard.dto.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) { }

  @Get('stats')
  @ResponseMessage('Dashboard stats fetched successfully')
  @ApiOperation({
    summary: 'Get dashboard KPIs calculated from PostgreSQL data',
  })
  @ApiOkResponse({ type: DashboardStatsResponseDto })
  stats(): Promise<DashboardStatsResponseDto> {
    return this.dashboardService.stats();
  }

  @Get('charts')
  @ResponseMessage('Dashboard charts fetched successfully')
  @ApiOperation({
    summary: 'Get revenue chart buckets for the selected time period',
  })
  @ApiOkResponse({ type: DashboardChartsResponseDto })
  charts(
    @Query() query: DashboardChartQueryDto,
  ): Promise<DashboardChartsResponseDto> {
    return this.dashboardService.charts(query.period);
  }

  @Get('alerts')
  @ResponseMessage('Dashboard alerts fetched successfully')
  @ApiOperation({
    summary: 'Get alerts derived from pending, failed, and overdue records',
  })
  @ApiOkResponse({ type: DashboardAlertsResponseDto })
  alerts(): Promise<DashboardAlertsResponseDto> {
    return this.dashboardService.alerts();
  }
}
