import { Global, Module, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Global()
@Module({
  providers: [
    {
      provide: PrismaClient,
      useClass: PrismaClient,
    },
  ],
  exports: [PrismaClient],
})
export class PrismaModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaModule.name);

  constructor(private readonly prisma: PrismaClient) {}

  async onModuleInit() {
    try {
      await this.prisma.$connect();
      this.logger.log('Prisma conectado com sucesso');
    } catch (err) {
      this.logger.error('Falha ao conectar ao Prisma:', err);
      throw err;
    }
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
