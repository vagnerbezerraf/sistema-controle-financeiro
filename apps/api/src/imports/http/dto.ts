import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class PreviewCsvImportRequest {
  @ApiProperty({ description: 'Conteudo do arquivo CSV.' })
  @IsString()
  @IsNotEmpty({ message: 'O conteudo do CSV e obrigatorio' })
  csv!: string;

  @ApiProperty({ description: 'Conta de destino dos lancamentos importados.' })
  @IsUUID()
  accountId!: string;

  @ApiProperty({ required: false, description: 'Nome do arquivo, usado apenas para auditoria.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;
}

export class PreviewOfxImportRequest {
  @ApiProperty({ description: 'Conteudo do arquivo OFX.' })
  @IsString()
  @IsNotEmpty({ message: 'O conteudo do OFX e obrigatorio' })
  ofx!: string;

  @ApiProperty({ description: 'Conta de destino dos lancamentos importados.' })
  @IsUUID()
  accountId!: string;

  @ApiProperty({ required: false, description: 'Nome do arquivo, usado apenas para auditoria.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;
}

export class ListImportsQuery {
  @ApiProperty({ required: false, enum: ['previewed', 'committed', 'undone'] })
  @IsOptional()
  @IsIn(['previewed', 'committed', 'undone'])
  status?: 'previewed' | 'committed' | 'undone';
}
