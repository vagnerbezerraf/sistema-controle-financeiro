import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CurrencyCode, FinancialSpaceState, FinancialSpaceRole } from '@prisma/client';

export class CreateFinancialSpaceRequest {
  @ApiProperty({ example: 'Financeiro familia' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ required: false, enum: CurrencyCode, default: CurrencyCode.BRL })
  @IsOptional()
  @IsEnum(CurrencyCode)
  primaryCurrency?: CurrencyCode;

  @ApiProperty({ required: false, example: 'America/Sao_Paulo' })
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class UpdateFinancialSpaceRequest {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({ required: false, enum: CurrencyCode })
  @IsOptional()
  @IsEnum(CurrencyCode)
  primaryCurrency?: CurrencyCode;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiProperty({ required: false, enum: FinancialSpaceState })
  @IsOptional()
  @IsEnum(FinancialSpaceState)
  state?: FinancialSpaceState;

  @ApiProperty({
    required: false,
    description: 'Versao atual do espaco (concorrencia otimista). Se divergir, responde 409 STALE_VERSION.',
    example: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  version?: number;
}

export class InviteMemberRequest {
  @ApiProperty({ example: 'convidado@exemplo.com' })
  @IsString()
  email!: string;

  @ApiProperty({ enum: FinancialSpaceRole })
  @IsEnum(FinancialSpaceRole)
  role!: FinancialSpaceRole;
}
