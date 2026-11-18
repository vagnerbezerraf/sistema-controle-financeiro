import { IsDateString, IsEnum, IsInt, IsNumberString, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AccountType, CurrencyCode, EntityState } from '@prisma/client';

export class CreateAccountRequest {
  @ApiProperty({ example: 'Conta corrente Itau' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: AccountType })
  @IsEnum(AccountType)
  type!: AccountType;

  @ApiProperty({ required: false, enum: CurrencyCode, default: CurrencyCode.BRL })
  @IsOptional()
  @IsEnum(CurrencyCode)
  currency?: CurrencyCode;

  @ApiProperty({ required: false, example: '0.00' })
  @IsOptional()
  @IsNumberString({}, { message: 'Saldo inicial deve ser numerico decimal' })
  initialBalance?: string;

  @ApiProperty({ required: false, example: '2026-08-01' })
  @IsOptional()
  @IsDateString({ strict: true })
  initialBalanceDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  institution?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  number?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  icon?: string;
}

export class UpdateAccountRequest {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  institution?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  number?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiProperty({ required: false, enum: EntityState })
  @IsOptional()
  @IsEnum(EntityState)
  state?: EntityState;

  @ApiProperty({
    required: false,
    description: 'Versao atual da conta (concorrencia otimista). Se divergir, responde 409 STALE_VERSION.',
    example: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  version?: number;
}
