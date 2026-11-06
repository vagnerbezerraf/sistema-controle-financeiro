import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { AppModule } from './app.module';

export async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  // Redireciona o Logger do Nest para o Pino estruturado.
  app.useLogger(app.get(PinoLogger));
  const logger = new Logger('Bootstrap');

  const config = app.get(ConfigService);
  const host = config.get<string>('app.API_HOST') ?? '0.0.0.0';
  const port = config.get<number>('app.API_PORT') ?? 3001;
  const nodeEnv = config.get<string>('app.NODE_ENV') ?? 'development';
  const corsOrigins = config.get<string[]>('app.API_CORS_ORIGIN') ?? [];
  const baseUrl = config.get<string>('app.API_BASE_URL') ?? `http://localhost:${port}`;

  app.enableShutdownHooks();
  // A versão faz parte do prefixo público (`/api/v1`). Não habilitar o
  // versionamento URI do Nest em paralelo, sob pena de gerar `/api/v1/v1/...`.
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'healthz'] });
  app.enableCors({
    origin: nodeEnv === 'production' ? corsOrigins : true,
    credentials: true,
    exposedHeaders: ['x-correlation-id', 'x-request-id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      forbidNonWhitelisted: true,
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: nodeEnv === 'production' ? undefined : false,
    }),
  );

  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: nodeEnv === 'production' ? 120 : 3000,
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: false,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Sistema de Controle Financeiro - API')
    .setDescription(
      'API REST para o SCF. Valores monetarios trafegados como strings decimais ou inteiros em centavos.',
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addServer(baseUrl)
    .build();

  const swaggerDoc = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDoc, {
    customSiteTitle: 'SCF - API Docs',
    swaggerOptions: {
      displayRequestDuration: true,
      filter: true,
    },
  });

  app.flushLogs();
  await app.listen(port, host);
  logger.log(`Ambiente: ${nodeEnv}`);
  logger.log(`API escutando em ${host}:${port}`);
  logger.log(`Documentacao OpenAPI em ${baseUrl}/docs`);
  logger.log(`Health check em ${baseUrl}/health`);
}
