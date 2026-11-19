import { ArrayMinSize, IsArray, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ReconciliationQuery {
  @ApiProperty({
    required: false,
    description: 'Restringe a visao aos itens de um lote de importacao aplicado.',
  })
  @IsOptional()
  @IsUUID()
  batchId?: string;
}

export class ReconciliationMatchDto {
  @ApiProperty({ description: 'Conta prevista/em aberto a conciliar' })
  @IsUUID()
  obligationId!: string;

  @ApiProperty({ description: 'Item importado (lancamento confirmado) que quita a conta' })
  @IsUUID()
  transactionId!: string;
}

export class ApplyReconciliationRequest {
  @ApiProperty({ type: [ReconciliationMatchDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReconciliationMatchDto)
  matches!: ReconciliationMatchDto[];
}

export class AutoReconcileRequest {
  @ApiProperty({
    required: false,
    description: 'Restringe a conciliacao automatica a um lote; ausente considera todos.',
  })
  @IsOptional()
  @IsUUID()
  batchId?: string;
}
