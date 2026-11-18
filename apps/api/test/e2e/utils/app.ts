import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../../src/app.module';

/**
 * Sobe a aplicacao como no `bootstrap()` de producao (prefixo global `api/v1`
 * e o mesmo ValidationPipe), mas sem `listen()`: o Supertest usa o servidor
 * HTTP interno do Nest.
 */
export async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaClient;
}> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'healthz'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();

  return { app, prisma: app.get(PrismaClient) };
}
