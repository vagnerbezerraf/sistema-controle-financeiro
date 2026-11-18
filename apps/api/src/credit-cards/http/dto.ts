import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CurrencyCode } from '@prisma/client';

export class CreateCreditCardRequest {
  @ApiProperty({ example: 'Cartao Nubank' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: '5000.00', description: 'Limite concedido pelo emissor' })
  @IsNumberString({}, { message: 'Limite deve ser numerico decimal' })
  limit!: string;

  @ApiProperty({ example: 25, description: 'Dia de fechamento da fatura (1 a 31)' })
  @IsInt()
  @Min(1)
  @Max(31)
  closingDay!: number;

  @ApiProperty({ example: 5, description: 'Dia de vencimento da fatura (1 a 31)' })
  @IsInt()
  @Min(1)
  @Max(31)
  dueDay!: number;

  @ApiProperty({ required: false, enum: CurrencyCode, default: CurrencyCode.BRL })
  @IsOptional()
  @IsEnum(CurrencyCode)
  currency?: CurrencyCode;

  @ApiProperty({ required: false, example: 'Nubank' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  institution?: string;

  @ApiProperty({ required: false, example: '#8A2BE2' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ required: false, example: 'credit-card' })
  @IsOptional()
  @IsString()
  icon?: string;
}

export class UpdateCreditCardRequest {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({ required: false, example: '8000.00' })
  @IsOptional()
  @IsNumberString({}, { message: 'Limite deve ser numerico decimal' })
  limit?: string;

  @ApiProperty({ required: false, example: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  closingDay?: number;

  @ApiProperty({ required: false, example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dueDay?: number;

  @ApiProperty({
    required: false,
    description: 'Versao atual da conta tecnica do cartao (concorrencia otimista).',
    example: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  version?: number;
}

export class PayInvoiceRequest {
  @ApiProperty({ description: 'Conta de origem do pagamento (nao pode ser o proprio cartao)' })
  @IsString()
  fromAccountId!: string;

  @ApiProperty({
    required: false,
    example: '1234.56',
    description: 'Valor pago. Se ausente, paga o saldo devedor da fatura.',
  })
  @IsOptional()
  @IsNumberString({}, { message: 'Valor deve ser numerico decimal' })
  amount?: string;

  @ApiProperty({ required: false, example: '2026-04-05' })
  @IsOptional()
  @IsDateString({ strict: true })
  effectiveDate?: string;
}
