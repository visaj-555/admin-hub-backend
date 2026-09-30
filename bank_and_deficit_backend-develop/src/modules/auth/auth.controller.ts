import {
  Controller,
  Post,
  Patch,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
  Body,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { I18n, I18nContext } from 'nestjs-i18n';
import { ApiResponse } from 'src/common/common.exports';
import {
  ResendOtpDto,
  VerifyForgotOtpDto,
  VerifyOtpDto,
} from './dto/payloads/otp.dto';
import { JwtAuthGuard } from './guards/auth.guard';
import { LoginDto } from './dto/payloads/login.dto';
import {
  ChangePasswordDto,
  ResetPasswordDto,
} from './dto/payloads/password.dto';
import { RegisterDto } from './dto/payloads/register.dto';
import { GoogleSignInDto } from './dto/payloads/google-sign-in.dto';
import { GetUser } from 'src/common/decorators/get-user';
import { RefreshTokenDto } from './dto/payloads/refresh-token.dto';
import { ForgotPasswordDto } from './dto/payloads/forgot-password.dto';
import { LoginDataDto } from './dto/responses/login-data.dto';
import {
  ChangePasswordApiResponseDto,
  ForgotPasswordApiResponseDto,
  LoginApiResponseDto,
  RefreshTokenApiResponseDto,
  RegisterApiResponseDto,
  ResendOtpApiResponseDto,
  ResetPasswordApiResponseDto,
  VerifyForgotOtpApiResponseDto,
  VerifyOtpApiResponseDto,
  VerifyTokenApiResponseDto,
  UpdateSettingsApiResponseDto,
  LogoutApiResponseDto,
  DeleteAccountApiResponseDto,
} from './dto/responses/auth-api-response.dto';
import { UpdateSettingsDto } from './dto/payloads/settings.dto';
import { UpdateSettingsResponseDataDto } from './dto/responses/settings-response.dto';
import type { JwtPayload } from '../auth/interfaces/auth.interface';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ============== REGISTER ============== //

  @Post('register')
  @ApiOperation({ summary: 'Register a new account and send OTP' })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({
    type: RegisterApiResponseDto,
    description: 'OTP sent successfully',
  })
  async create(
    @Body() dto: RegisterDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<unknown>> {
    const auth = await this.authService.create(dto);
    return ApiResponse.created(auth, i18n.t('auth.otp.sent'));
  }

  // ============== VERIFY OTP ============== //

  @Post('verify-otp')
  @ApiOperation({ summary: 'Verify email OTP' })
  @ApiBody({ type: VerifyOtpDto })
  @ApiOkResponse({
    type: VerifyOtpApiResponseDto,
    description: 'OTP verified successfully',
  })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<void>> {
    const result = await this.authService.verifyOtp(dto);
    return ApiResponse.success(result, i18n.t('auth.otp.verified'));
  }

  // ============== RESEND OTP ============== //

  @Post('resend-otp')
  @ApiOperation({
    summary: 'Resend OTP (email verification or forgot password)',
  })
  @ApiBody({ type: ResendOtpDto })
  @ApiOkResponse({
    type: ResendOtpApiResponseDto,
    description: 'OTP resent successfully',
  })
  async resendOtp(
    @Body() dto: ResendOtpDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<null>> {
    await this.authService.resendOtp(dto);
    return ApiResponse.success(null, i18n.t('auth.otp.sent'));
  }

  // ============== LOGIN ============== //

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({
    type: LoginApiResponseDto,
    description: 'User logged in successfully',
  })
  async login(
    @Body() dto: LoginDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<LoginDataDto>> {
    const result = await this.authService.login(dto);
    return ApiResponse.success(result, i18n.t('auth.success.loggedIn'));
  }

  // ============== GOOGLE SIGN IN ============== //

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with Google ID token (Flutter/mobile)' })
  @ApiBody({ type: GoogleSignInDto })
  @ApiOkResponse({
    type: LoginApiResponseDto,
    description: 'User signed in with Google successfully',
  })
  async signInWithGoogle(
    @Body() dto: GoogleSignInDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<LoginDataDto>> {
    const result = await this.authService.signInWithGoogle(dto);
    return ApiResponse.success(result, i18n.t('auth.success.loggedIn'));
  }

  // ============== REFRESH TOKEN ============== //

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({
    type: RefreshTokenApiResponseDto,
    description: 'Access token refreshed successfully',
  })
  async refreshToken(
    @Body() dto: RefreshTokenDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<{ accessToken: string; refreshToken: string }>> {
    const result = await this.authService.refreshAccessToken(dto.refreshToken);
    return ApiResponse.success(result, i18n.t('auth.success.tokenRefreshed'));
  }

  // ============== FORGOT PASSWORD ============== //

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request OTP for password reset' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkResponse({
    type: ForgotPasswordApiResponseDto,
    description: 'OTP sent if account exists',
  })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<null>> {
    await this.authService.forgotPassword(dto.email);
    return ApiResponse.success(null, i18n.t('auth.otp.sent'));
  }

  // ============== VERIFY FORGOT PASSWORD OTP ============== //

  @Post('verify-forgot-otp')
  @ApiOperation({ summary: 'Verify forgot password OTP' })
  @ApiBody({ type: VerifyForgotOtpDto })
  @ApiOkResponse({
    type: VerifyForgotOtpApiResponseDto,
    description: 'OTP verified, reset token returned',
  })
  async verifyForgotOtp(
    @Body() dto: VerifyForgotOtpDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<{ resetToken: string }>> {
    const result = await this.authService.verifyForgotPasswordOtp(dto);
    return ApiResponse.success(result, i18n.t('auth.otp.verified'));
  }

  // ============== RESET PASSWORD ============== //

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using reset token' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({
    type: ResetPasswordApiResponseDto,
    description: 'Password updated successfully',
  })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<null>> {
    await this.authService.resetPassword(dto);
    return ApiResponse.success(null, i18n.t('auth.success.passwordUpdated'));
  }

  // ============== CHANGE PASSWORD ============== //

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Change account password' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiOkResponse({
    type: ChangePasswordApiResponseDto,
    description: 'Password changed successfully',
  })
  async changePassword(
    @GetUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<null>> {
    await this.authService.changePassword(user.authId, dto);
    return ApiResponse.success(null, i18n.t('auth.success.passwordUpdated'));
  }

  // ============== VERIFY TOKEN ============== //

  @Post('verify-token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Verify JWT token and return user information' })
  @ApiOkResponse({
    type: VerifyTokenApiResponseDto,
    description: 'Token verified successfully',
  })
  async verifyToken(
    @GetUser() user: JwtPayload,
    @I18n() i18n: I18nContext,
  ): Promise<
    ApiResponse<{
      user: {
        id: string;
        userId: string | null;
        name: string;
        email: string;
        role: string;
      };
    }>
  > {
    const userData = await this.authService.verifyToken(user.authId);
    return ApiResponse.success(
      { user: userData },
      i18n.t('auth.success.tokenValid'),
    );
  }

  // ============== UPDATE SETTINGS ============== //

  @Patch('settings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update user settings' })
  @ApiBody({ type: UpdateSettingsDto })
  @ApiOkResponse({
    type: UpdateSettingsApiResponseDto,
    description: 'Settings updated successfully',
  })
  async updateSettings(
    @GetUser() user: JwtPayload,
    @Body() dto: UpdateSettingsDto,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<UpdateSettingsResponseDataDto>> {
    const result = await this.authService.updateSettings(user.authId, dto);
    return ApiResponse.success(result, i18n.t('auth.success.settingsUpdated'));
  }

  // ============== LOGOUT ============== //

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Logout and invalidate session' })
  @ApiOkResponse({
    type: LogoutApiResponseDto,
    description: 'Logged out successfully',
  })
  async logout(
    @GetUser() user: JwtPayload,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<null>> {
    await this.authService.logout(user.authId);
    return ApiResponse.success(null, i18n.t('auth.success.loggedOut'));
  }

  // ============== DELETE ACCOUNT ============== //

  @Delete('delete-account')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Delete account and all related data from S3 and DB',
  })
  @ApiOkResponse({
    type: DeleteAccountApiResponseDto,
    description: 'Account deleted successfully',
  })
  async deleteAccount(
    @GetUser() user: JwtPayload,
    @I18n() i18n: I18nContext,
  ): Promise<ApiResponse<null>> {
    await this.authService.deleteAccount(user.authId);
    return ApiResponse.success(null, i18n.t('auth.success.accountDeleted'));
  }
}
