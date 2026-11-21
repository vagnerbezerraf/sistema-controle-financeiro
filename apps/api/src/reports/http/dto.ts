import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportJobType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export class CreateReportJobRequest {
  @ApiProperty({
    enum: ReportJobType,
    description: 'Tipo do relatorio a gerar. Hoje apenas `transactions_export`.',
  })
  @IsEnum(ReportJobType)
  type!: ReportJobType;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Inicio do periodo (YYYY-MM-DD).' })
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @ApiPropertyOptional({ example: '2026-01-31', description: 'Fim do periodo (YYYY-MM-DD), inclusive.' })
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}
