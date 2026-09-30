import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiProperty,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ApiResponseDto } from '../../common/dto/api-response.dto.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { AuthService } from './auth.service.js';
import { AuthUserDto, LoginDto, LoginResponseDto } from './dto/auth.dto.js';

class CurrentUserResponseDto extends ApiResponseDto<AuthUserDto> {
  @ApiProperty({ type: String, example: 'Admin profile fetched successfully' })
  declare message?: string;

  @ApiProperty({ type: AuthUserDto })
  declare data: AuthUserDto;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('login')
  @ResponseMessage('Logged in Successfully')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Log in as an active administrator' })
  @ApiOkResponse({ type: LoginResponseDto })
  login(@Body() input: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(input);
  }

  @Get('me')
  @ResponseMessage('Admin profile fetched successfully')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated administrator profile' })
  @ApiOkResponse({ type: CurrentUserResponseDto })
  me(@CurrentUser() currentUser: JwtPayload): Promise<{ data: AuthUserDto }> {
    return this.authService.me(currentUser.sub);
  }
}
