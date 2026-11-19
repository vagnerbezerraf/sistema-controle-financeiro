import { IsDateString, IsNumberString, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBudgetRequest {
  @ApiProperty({ example: '2026-06-01' })
  @IsDateString({ strict: true })
  periodStart!: string;

  @ApiProperty({ example: '2026-06-30' })
  @IsDateString({ strict: true })
  periodEnd!: string;

  @ApiProperty({ example: '1000.00' })
  @IsNumberString({}, { message: 'Limite deve ser numerico decimal' })
  amountLimit!: string;

  @ApiProperty({ required: false, description: 'Categoria alvo. Ausente = todas as despesas.' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class UpdateBudgetRequest {
  @ApiProperty({ required: false, example: '1200.00' })
  @IsOptional()
  @IsNumberString({}, { message: 'Limite deve ser numerico decimal' })
  amountLimit?: string;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Enviar null remove a restricao de categoria (orcamento geral).',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;
}

export class ListBudgetsQuery {
  @ApiProperty({ required: false, description: 'Inicio da janela (YYYY-MM-DD). Padrao: 1o dia do mes corrente.' })
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @ApiProperty({ required: false, description: 'Fim da janela (YYYY-MM-DD). Padrao: ultimo dia do mes corrente.' })
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}
