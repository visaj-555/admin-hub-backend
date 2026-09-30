import { Module, ValidationPipe, BadRequestException } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { I18nModule, QueryResolver, AcceptLanguageResolver } from 'nestjs-i18n';
import * as path from 'path';
import { AppService } from './app.service';
import { CommonModule } from 'src/common/common.module';
import { AppController } from 'src/app.controller';
import {
  HttpExceptionFilter,
  ResponseInterceptor,
} from 'src/common/common.exports';
import { AuthModule } from 'src/modules/auth/auth.module';
import { RedisModule } from 'src/modules/redis/redis.module';
import { CountryModule } from './modules/country/country.module';
import { UserModule } from './modules/user/user.module';
import { PostModule } from './modules/post/post.module';
import { FollowModule } from './modules/follow/follow.module';
import { NotificationModule } from './modules/notification/notification.module';
import { ChatModule } from './modules/chat/chat.module';

// ------------ ENVIRONMENT NORMALIZATION ------------ //
const NODE_ENV = process.env.NODE_ENV ?? 'development';
const APP_ENV = process.env.APP_ENV ?? 'local';

const isProd = NODE_ENV === 'production';

// ------------ I18N PATH RESOLUTION ------------ //
const I18N_PATH =
  NODE_ENV === 'production'
    ? path.join(__dirname, '..', 'common', 'i18n')
    : path.join(process.cwd(), 'src/common/i18n');

console.log('I18N_PATH:', I18N_PATH);
console.log('NODE_ENV:', NODE_ENV);
console.log('isProd:', isProd);

// ------------ APPLICATION MODULE ------------ //
@Module({
  imports: [
    // ------------ GLOBAL CONFIGURATION ------------//
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${APP_ENV}`, // .env.local | .env.stage | .env.prod
        '.env',
      ],
    }),
    CountryModule,
    CommonModule,
    RedisModule,
    AuthModule,
    UserModule,
    PostModule,
    FollowModule,
    NotificationModule,
    ChatModule,

    // ------------ INTERNATIONALIZATION (I18N) ------------ //
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loaderOptions: {
        path: I18N_PATH,
        watch: !isProd,
        logging: true,
      },
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        AcceptLanguageResolver,
      ],
    }),
  ],

  // ------------ CONTROLLERS ------------//
  controllers: [AppController],

  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },

    // ------------ GLOBAL EXCEPTION FILTER ------------ //
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },

    // ------------ GLOBAL VALIDATION PIPE ------------ //
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
        exceptionFactory: (errors) => {
          return new BadRequestException(errors);
        },
      }),
    },
  ],
})
export class AppModule {}
