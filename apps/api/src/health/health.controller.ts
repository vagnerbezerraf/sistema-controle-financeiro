import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';
import { Public } from '../common/auth/auth.guard';

@ApiTags('health')
@Controller()
@Public()
export class HealthController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get('health')
  @ApiOperation({ summary: 'Verifica saude da API' })
  @HttpCode(HttpStatus.OK)
  async check() {
    return this.buildStatus();
  }

  // Alias exigido por orquestradores/health checks (o Nest só registra um
  // caminho por decorador, por isso `healthz` precisa do seu próprio handler).
  @Get('healthz')
  @ApiOperation({ summary: 'Alias de verificacao de saude da API' })
  @HttpCode(HttpStatus.OK)
  async checkAlias() {
    return this.buildStatus();
  }

  private async buildStatus() {
    const services: Record<string, string> = {};

    try {
      await this.prisma.$queryRaw`SELECT 1 as check_health`;
      services.postgres = 'ok';
    } catch {
      services.postgres = 'degraded';
    }

    const overall = Object.values(services).some((s) => s !== 'ok') ? 'degraded' : 'ok';

    return {
      status: overall,
      version: process.env.npm_package_version ?? '0.1.0',
      timestamp: new Date().toISOString(),
      services,
    };
  }
}
