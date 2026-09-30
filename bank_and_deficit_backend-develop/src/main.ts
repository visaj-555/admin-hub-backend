import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { MulterExceptionFilter } from 'src/common/exceptions/multer.exception.filter';
import { Logger } from '@nestjs/common';

const logger = new Logger('Bootstrap');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.useGlobalFilters(new MulterExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ------------------ CORS ------------------
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? [
      'https://stag.d3eh7bdhx8gko7.amplifyapp.com',
      'http://localhost:3000',
      'http://localhost:3001',
      'https://stag.d3eh7bdhx8gko7.amplifyapp.com',
      'http://127.0.0.1:5500',
      'http://localhost:5500',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Accept-Language',
    ],
    credentials: true,
    maxAge: 3600,
  });

  // ------------------ Global Prefix ------------------
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'api'],
  });

  // ------------------ Swagger Config ------------------
  const swaggerConfig = new DocumentBuilder()
    .setTitle('BANK AND DEFICIT API')
    .setDescription('API documentation for BANK AND DEFICIT backend')
    .setVersion('1.0')

    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        in: 'header',
      },
      'JWT-auth',
    )

    .addGlobalParameters({
      name: 'Accept-Language',
      in: 'header',
      required: false,
      description: 'Language code (en, hi)',
      schema: {
        type: 'string',
        enum: ['en', 'hi'],
        default: 'en',
      },
    })

    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // ------------------ Server ------------------
  const port = Number(process.env.PORT) || 3001;
  await app.listen(port);

  logger.log(`🚀 Application running at http://localhost:${port}/api/v1`);
  logger.log(`📚 Swagger available at http://localhost:${port}/api`);
}

bootstrap().catch((error) => {
  logger.error('❌ Failed to start application', error);
  process.exit(1);
});
