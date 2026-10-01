import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ResponseMessage } from '../../common/decorators/response-message.decorator.js';
import { ApiResponseDto } from '../../common/dto/api-response.dto.js';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface.js';
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
  constructor(private readonly authService: AuthService) {}

  @Public()
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
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated administrator profile' })
  @ApiOkResponse({ type: CurrentUserResponseDto })
  me(@CurrentUser() currentUser: JwtPayload): Promise<{ data: AuthUserDto }> {
    return this.authService.me(currentUser.sub);
  }
}
