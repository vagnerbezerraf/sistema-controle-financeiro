import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CurrencyCode } from '@prisma/client';
import { MAX_OCCURRENCES_PER_GENERATION, RECURRENCE_FREQUENCIES } from '../domain/recurrence';

/** Tipos aceitos em uma obrigacao (nao ha transferencia nem ajuste previstos). */
export const OBLIGATION_TYPES = ['income', 'expense'] as const;
/** Situacoes que o usuario pode informar na criacao manual. */
export const MANUAL_OBLIGATION_STATUSES = ['forecast', 'pending'] as const;
/** Situacoes que o usuario pode informar no PATCH (as demais vem da conciliacao). */
export const EDITABLE_OBLIGATION_STATUSES = ['forecast', 'pending', 'ignored', 'canceled'] as const;

export class RecurrenceTemplateInput {
  @ApiProperty({ enum: OBLIGATION_TYPES, example: 'expense' })
  @IsIn(OBLIGATION_TYPES)
  type!: (typeof OBLIGATION_TYPES)[number];

  @ApiProperty({ example: 'Aluguel' })
  @IsString()
  @MaxLength(250)
  description!: string;

  @ApiProperty({ example: '1800.00' })
  @IsNumberString({}, { message: 'Valor deve ser numerico decimal' })
  amount!: string;

  @ApiProperty({ required: false, enum: CurrencyCode, default: CurrencyCode.BRL })
  @IsOptional()
  @IsEnum(CurrencyCode)
  currency?: CurrencyCode;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  accountId?: string;
}

export class CreateRecurrenceRequest {
  @ApiProperty({ enum: RECURRENCE_FREQUENCIES, example: 'monthly' })
  @IsIn(RECURRENCE_FREQUENCIES)
  frequency!: (typeof RECURRENCE_FREQUENCIES)[number];

  @ApiProperty({ required: false, default: 1, description: 'A cada N periodos (>= 1)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  interval?: number;

  @ApiProperty({ example: '2026-01-10' })
  @IsDateString({ strict: true })
  startDate!: string;

  @ApiProperty({ required: false, example: '2026-12-10' })
  @IsOptional()
  @IsDateString({ strict: true })
  endDate?: string;

  @ApiProperty({ required: false, example: 12, description: 'Numero maximo de ocorrencias' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_OCCURRENCES_PER_GENERATION)
  occurrencesLimit?: number;

  @ApiProperty({ type: RecurrenceTemplateInput })
  @ValidateNested()
  @Type(() => RecurrenceTemplateInput)
  template!: RecurrenceTemplateInput;

  @ApiProperty({
    required: false,
    example: '2027-01-10',
    description: 'Materializa as previsoes ate esta data. Padrao: hoje + 12 meses.',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  generateUpTo?: string;
}

export class UpdateRecurrenceRequest {
  @ApiProperty({ required: false, enum: RECURRENCE_FREQUENCIES })
  @IsOptional()
  @IsIn(RECURRENCE_FREQUENCIES)
  frequency?: (typeof RECURRENCE_FREQUENCIES)[number];

  @ApiProperty({ required: false, description: 'A cada N periodos (>= 1)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  interval?: number;

  @ApiProperty({ required: false, nullable: true, description: 'Enviar null remove o fim da vigencia' })
  @IsOptional()
  @IsDateString({ strict: true })
  endDate?: string | null;

  @ApiProperty({ required: false, nullable: true, description: 'Enviar null remove o limite' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_OCCURRENCES_PER_GENERATION)
  occurrencesLimit?: number | null;

  @ApiProperty({ required: false, type: RecurrenceTemplateInput })
  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceTemplateInput)
  template?: RecurrenceTemplateInput;

  @ApiProperty({ required: false, enum: ['active', 'archived'] })
  @IsOptional()
  @IsIn(['active', 'archived'])
  state?: 'active' | 'archived';

  @ApiProperty({ required: false, example: '2027-06-30' })
  @IsOptional()
  @IsDateString({ strict: true })
  generateUpTo?: string;

  @ApiProperty({
    required: false,
    description: 'Versao atual da regra (concorrencia otimista).',
    example: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  version?: number;
}

export class GenerateOccurrencesRequest {
  @ApiProperty({ required: false, example: '2027-12-31' })
  @IsOptional()
  @IsDateString({ strict: true })
  upTo?: string;
}

export class ListRecurrencesQuery {
  @ApiProperty({ required: false, enum: ['active', 'archived'] })
  @IsOptional()
  @IsIn(['active', 'archived'])
  state?: 'active' | 'archived';
}

export class CreateObligationRequest {
  @ApiProperty({ enum: OBLIGATION_TYPES, example: 'expense' })
  @IsIn(OBLIGATION_TYPES)
  type!: (typeof OBLIGATION_TYPES)[number];

  @ApiProperty({ example: 'IPTU 2026' })
  @IsString()
  @MaxLength(250)
  description!: string;

  @ApiProperty({ example: '450.00' })
  @IsNumberString({}, { message: 'Valor deve ser numerico decimal' })
  amount!: string;

  @ApiProperty({ example: '2026-03-20' })
  @IsDateString({ strict: true })
  dueDate!: string;

  @ApiProperty({ required: false, enum: CurrencyCode, default: CurrencyCode.BRL })
  @IsOptional()
  @IsEnum(CurrencyCode)
  currency?: CurrencyCode;

  @ApiProperty({ required: false, enum: MANUAL_OBLIGATION_STATUSES, default: 'pending' })
  @IsOptional()
  @IsIn(MANUAL_OBLIGATION_STATUSES)
  status?: (typeof MANUAL_OBLIGATION_STATUSES)[number];
}

export class UpdateObligationRequest {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  description?: string;

  @ApiProperty({ required: false, example: '460.00' })
  @IsOptional()
  @IsNumberString({}, { message: 'Valor deve ser numerico decimal' })
  amount?: string;

  @ApiProperty({ required: false, example: '2026-03-25' })
  @IsOptional()
  @IsDateString({ strict: true })
  dueDate?: string;

  @ApiProperty({ required: false, enum: EDITABLE_OBLIGATION_STATUSES })
  @IsOptional()
  @IsIn(EDITABLE_OBLIGATION_STATUSES)
  status?: (typeof EDITABLE_OBLIGATION_STATUSES)[number];

  @ApiProperty({ required: false, description: 'Versao atual da obrigacao (concorrencia otimista).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  version?: number;
}

export class ReconcileObligationRequest {
  @ApiProperty({ description: 'Transacao confirmada que quita (ou abate) a obrigacao' })
  @IsUUID()
  transactionId!: string;
}

export class CalendarQuery {
  @ApiProperty({ required: false, description: 'Inicio do periodo (YYYY-MM-DD). Padrao: 1o dia do mes corrente.' })
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @ApiProperty({ required: false, description: 'Fim do periodo (YYYY-MM-DD). Padrao: ultimo dia do mes corrente.' })
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}

export class AlertsQuery {
  @ApiProperty({
    required: false,
    default: 7,
    description: 'Horizonte em dias para o alerta "vence em breve" (0 a 90). Padrao: 7.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  @Type(() => Number)
  horizonDays?: number;
}

export class ProjectionQuery {
  @ApiProperty({
    required: false,
    default: 30,
    description: 'Horizonte em dias para a projecao de saldo (1 a 180). Padrao: 30.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  @Type(() => Number)
  horizonDays?: number;
}

export class ListObligationsQuery {
  @ApiProperty({ required: false, description: 'Vencimento a partir de (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @ApiProperty({ required: false, description: 'Vencimento ate (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @ApiProperty({ required: false, enum: ['forecast', 'pending', 'partially_reconciled', 'reconciled', 'ignored', 'canceled'] })
  @IsOptional()
  @IsIn(['forecast', 'pending', 'partially_reconciled', 'reconciled', 'ignored', 'canceled'])
  status?: string;

  @ApiProperty({ required: false, enum: OBLIGATION_TYPES })
  @IsOptional()
  @IsIn(OBLIGATION_TYPES)
  type?: string;

  @ApiProperty({ required: false, description: 'Somente as ocorrencias de uma regra de recorrencia' })
  @IsOptional()
  @IsUUID()
  recurrenceRuleId?: string;

  @ApiProperty({ required: false, enum: ['true', 'false'], description: 'Somente vencidas (true) ou nao vencidas (false)' })
  @IsOptional()
  @IsIn(['true', 'false'])
  overdue?: string;
}
