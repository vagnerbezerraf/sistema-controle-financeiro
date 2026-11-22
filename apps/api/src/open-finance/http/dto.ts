import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateOpenFinanceConsentRequest {
  @ApiProperty({
    example: 'banco-exemplo',
    description: 'Identificador da instituicao no provedor de Open Finance.',
  })
  @IsString()
  @MaxLength(120)
  institutionId!: string;

  @ApiPropertyOptional({
    example: 'scf://open-finance/callback',
    description: 'URL de retorno apos a autorizacao no provedor. Padrao: callback do app.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  redirectUrl?: string;
}

export class SyncOpenFinanceConsentRequest {
  @ApiPropertyOptional({
    example: '3f1c2b4a-9d8e-4c7b-8a1f-2e6d5c4b3a21',
    description:
      'Conta de destino dos lancamentos sincronizados. Padrao: a ultima conta usada neste consentimento.',
  })
  @IsOptional()
  @IsUUID()
  accountId?: string;
}
