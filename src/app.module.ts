import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';
import { validateEnvironment } from './config/env.validation.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BookingModule } from './modules/booking/booking.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { TransactionModule } from './modules/transaction/transaction.module.js';
import { UserModule } from './modules/user/user.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: () => [{ ttl: 60_000, limit: 100 }],
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UserModule,
    TransactionModule,
    BookingModule,
    DashboardModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
