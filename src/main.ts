import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { join } from 'node:path';
import { AppModule } from './app.module.js';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>('PORT');
  const corsOrigin = config.getOrThrow<string[]>('CORS_ORIGIN');

  app.use(helmet());
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });
  app.enableCors({ origin: corsOrigin, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('AdminHub API')
    .setDescription(
      'Production-style REST API for the AdminHub dashboard: authentication, users, bookings, transactions, and dashboard analytics.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
    {
      swaggerOptions: {
        docExpansion: 'none',
        defaultModelsExpandDepth: -1,
        defaultModelExpandDepth: 1,
        filter: true,
        persistAuthorization: true,
      },
    },
  );

  await app.listen(port);
  logger.log(`Application running at http://localhost:${port}`);
  logger.log(`Swagger available at http://localhost:${port}/api/docs`);
}

await bootstrap();
