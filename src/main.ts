import 'dotenv/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { join } from 'node:path';
import { AppModule } from './app.module.js';
import { validateEnvironment } from './common/config/environment.js';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const config = validateEnvironment(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(helmet());
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });
  app.enableCors({ origin: config.corsOrigin, credentials: true });
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
    .setDescription('REST API for the AdminHub dashboard.')
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
      customCss: `
        .swagger-ui { font-size: 12px; }
        .swagger-ui .wrapper { max-width: 1100px; }
        .swagger-ui .opblock-summary { min-height: 38px; }
        .swagger-ui .scheme-container { padding: 8px 0; }
      `,
    },
  );

  await app.listen(config.port);
  logger.log(`Application running at http://localhost:${config.port}`);
  logger.log(`Swagger available at http://localhost:${config.port}/api/docs`);
}
await bootstrap();
