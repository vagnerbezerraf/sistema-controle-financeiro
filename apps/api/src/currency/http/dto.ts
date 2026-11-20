import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CurrencyCode } from '@prisma/client';

export class CreateExchangeRateRequest {
  @ApiProperty({ enum: CurrencyCode, description: 'Moeda de origem da taxa.' })
  @IsEnum(CurrencyCode)
  fromCurrency!: CurrencyCode;

  @ApiProperty({ enum: CurrencyCode, description: 'Moeda de destino da taxa.' })
  @IsEnum(CurrencyCode)
  toCurrency!: CurrencyCode;

  @ApiProperty({
    example: '5.4321',
    description: 'Quantas unidades de toCurrency valem 1 unidade de fromCurrency.',
  })
  @IsNumberString({}, { message: 'Taxa de cambio deve ser numerica decimal' })
  rate!: string;

  @ApiPropertyOptional({ example: '2026-11-21', description: 'Data de vigencia; padrao hoje.' })
  @IsOptional()
  @IsDateString({ strict: true })
  asOf?: string;

  @ApiPropertyOptional({ example: 'Banco Central', description: 'Origem da cotacao (livre).' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  source?: string;
}

export class UpdateExchangeRateRequest {
  @ApiPropertyOptional({ example: '5.5000' })
  @IsOptional()
  @IsNumberString({}, { message: 'Taxa de cambio deve ser numerica decimal' })
  rate?: string;

  @ApiPropertyOptional({ example: '2026-12-01' })
  @IsOptional()
  @IsDateString({ strict: true })
  asOf?: string;

  @ApiPropertyOptional({ example: 'Banco Central' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  source?: string;

  @ApiPropertyOptional({ description: 'Concorrencia otimista.', example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  version?: number;
}
