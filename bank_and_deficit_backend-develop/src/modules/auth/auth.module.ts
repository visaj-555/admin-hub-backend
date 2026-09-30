import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { CommonModule } from 'src/common/common.module';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { GoogleAuthService } from './google-auth.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    CommonModule,
    NotificationModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET_KEY');
        const expiresIn = Number(config.get<string>('JWT_EXPIRES_IN'));

        if (!secret) {
          throw new Error('JWT_SECRET_KEY is not defined');
        }

        if (!expiresIn || Number.isNaN(expiresIn)) {
          throw new Error('JWT_EXPIRES_IN is invalid');
        }

        return {
          secret,
          signOptions: {
            expiresIn: expiresIn,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtStrategy, GoogleAuthService],
  exports: [TokenService, PassportModule, JwtStrategy],
})
export class AuthModule {}
