import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MAX_EVOLUTION_MONTHS } from '../domain/advanced-report';

export class AdvancedReportQuery {
  @ApiProperty({
    required: false,
    example: '2026-06',
    description: 'Competencia no formato YYYY-MM (mes da taxa de poupanca). Padrao: mes corrente.',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month deve estar no formato YYYY-MM' })
  month?: string;

  @ApiProperty({
    required: false,
    default: 6,
    description: `Quantos meses a evolucao cobre (1 a ${MAX_EVOLUTION_MONTHS}). Padrao: 6.`,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_EVOLUTION_MONTHS)
  @Type(() => Number)
  months?: number;
}
