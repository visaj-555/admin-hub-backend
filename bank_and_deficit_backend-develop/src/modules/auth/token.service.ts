import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { JwtPayload } from './interfaces/auth.interface';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  generateAccessToken(payload: JwtPayload): string {
    const expiresIn = this.configService.getOrThrow<string>(
      'JWT_ACCESS_EXPIRES_IN',
    ) as StringValue | number;
    return this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_SECRET_KEY'),
      expiresIn,
    });
  }

  generateRefreshToken(payload: JwtPayload): string {
    const expiresIn = this.configService.getOrThrow<string>(
      'JWT_REFRESH_EXPIRES_IN',
    ) as StringValue | number;
    return this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn,
    });
  }

  verifyRefreshToken(token: string): JwtPayload {
    try {
      return this.jwtService.verify(token, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch (_error) {
      throw new Error('Invalid refresh token');
    }
  }

  generateResetPasswordToken(payload: { id: string; type: 'RESET_PASSWORD' }) {
    const expiresIn = this.configService.getOrThrow<string>(
      'JWT_RESET_PASSWORD_EXPIRES_IN',
    ) as StringValue | number;
    return this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_SECRET_KEY'),
      expiresIn,
    });
  }

  verifyResetPasswordToken(token: string): { id: string; type: string } {
    try {
      const payload = this.jwtService.verify<{ id: string; type: string }>(
        token,
        {
          secret: this.configService.getOrThrow<string>('JWT_SECRET_KEY'),
        },
      );

      if (payload.type !== 'RESET_PASSWORD') {
        throw new Error('Invalid token type');
      }

      return payload;
    } catch (_error) {
      throw new Error('Invalid or expired reset token');
    }
  }

  verifyAccessToken(token: string): JwtPayload {
    try {
      return this.jwtService.verify(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET_KEY'),
      });
    } catch (_error) {
      throw new Error('Invalid access token');
    }
  }
}
