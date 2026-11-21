import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

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
