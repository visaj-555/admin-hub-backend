import {
  createApiResponseDto,
  EmptyDataApiResponseDto,
} from 'src/common/dto/api-response-envelope.dto';
import { AuthPublicDataDto } from './auth-public-data.dto';
import { LoginDataDto } from './login-data.dto';
import { RefreshTokenDataDto } from './refresh-token-data.dto';
import { ResetTokenDataDto } from './reset-token-data.dto';
import { VerifyOtpDataDto } from './verify-otp-data.dto';
import { VerifyTokenDataDto } from './verify-token-data.dto';
import { UpdateSettingsResponseDataDto } from './settings-response.dto';

export const RegisterApiResponseDto = createApiResponseDto(AuthPublicDataDto);
export const VerifyOtpApiResponseDto = createApiResponseDto(VerifyOtpDataDto);
export const LoginApiResponseDto = createApiResponseDto(LoginDataDto);
export const RefreshTokenApiResponseDto =
  createApiResponseDto(RefreshTokenDataDto);
export const VerifyForgotOtpApiResponseDto =
  createApiResponseDto(ResetTokenDataDto);
export const VerifyTokenApiResponseDto =
  createApiResponseDto(VerifyTokenDataDto);
export const UpdateSettingsApiResponseDto = createApiResponseDto(
  UpdateSettingsResponseDataDto,
);

export {
  EmptyDataApiResponseDto as ResendOtpApiResponseDto,
  EmptyDataApiResponseDto as ForgotPasswordApiResponseDto,
  EmptyDataApiResponseDto as ResetPasswordApiResponseDto,
  EmptyDataApiResponseDto as ChangePasswordApiResponseDto,
  EmptyDataApiResponseDto as LogoutApiResponseDto,
  EmptyDataApiResponseDto as DeleteAccountApiResponseDto,
};
