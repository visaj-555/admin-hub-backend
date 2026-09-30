import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { UnauthorizedException } from 'src/common/exceptions';

export type GoogleIdTokenPayload = Pick<
  TokenPayload,
  | 'sub'
  | 'email'
  | 'email_verified'
  | 'given_name'
  | 'family_name'
  | 'name'
  | 'picture'
>;

@Injectable()
export class GoogleAuthService {
  private readonly client: OAuth2Client;
  private readonly audiences: string[];

  constructor(private readonly configService: ConfigService) {
    const webClientId =
      this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID');
    const iosClientId = this.configService.get<string>('GOOGLE_IOS_CLIENT_ID');
    const androidClientId = this.configService.get<string>(
      'GOOGLE_ANDROID_CLIENT_ID',
    );

    this.audiences = [webClientId, iosClientId, androidClientId].filter(
      (id): id is string => Boolean(id),
    );

    this.client = new OAuth2Client(webClientId);
  }

  async verifyIdToken(
    idToken: string,
    platform?: 'ios' | 'android',
  ): Promise<GoogleIdTokenPayload> {
    let targetAudience: string | string[];

    if (platform === 'ios') {
      const iosClientId = this.configService.get<string>(
        'GOOGLE_IOS_CLIENT_ID',
      );
      if (!iosClientId) {
        throw new UnauthorizedException(
          'GOOGLE_CLIENT_ID_NOT_CONFIGURED',
          'auth.errors.googleClientIdNotConfigured',
        );
      }
      targetAudience = iosClientId;
    } else if (platform === 'android') {
      const androidClientId = this.configService.get<string>(
        'GOOGLE_ANDROID_CLIENT_ID',
      );
      if (!androidClientId) {
        throw new UnauthorizedException(
          'GOOGLE_CLIENT_ID_NOT_CONFIGURED',
          'auth.errors.googleClientIdNotConfigured',
        );
      }
      targetAudience = androidClientId;
    } else {
      targetAudience = this.audiences;
    }

    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: targetAudience,
      });

      const payload = ticket.getPayload();

      if (!payload?.sub || !payload.email) {
        throw new UnauthorizedException(
          'INVALID_GOOGLE_TOKEN',
          'auth.errors.invalidGoogleToken',
        );
      }

      return {
        sub: payload.sub,
        email: payload.email,
        email_verified: payload.email_verified,
        given_name: payload.given_name,
        family_name: payload.family_name,
        name: payload.name,
        picture: payload.picture,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException(
        'INVALID_GOOGLE_TOKEN',
        'auth.errors.invalidGoogleToken',
      );
    }
  }
}
