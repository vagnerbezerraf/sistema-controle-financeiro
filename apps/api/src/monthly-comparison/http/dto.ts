import { IsOptional, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MonthlyComparisonQuery {
  @ApiProperty({
    required: false,
    example: '2026-06',
    description: 'Competencia no formato YYYY-MM. Padrao: mes corrente.',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month deve estar no formato YYYY-MM' })
  month?: string;
}
