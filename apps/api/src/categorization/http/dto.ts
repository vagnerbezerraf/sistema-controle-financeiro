import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const RULE_MATCH_TYPES = ['contains', 'equals', 'startsWith'] as const;
export const CATEGORIZATION_TARGET_TYPES = ['income', 'expense'] as const;
export const RULE_STATES = ['active', 'archived'] as const;

export class CreateCategorizationRuleRequest {
  @ApiProperty({ example: 'Mercado', description: 'Nome da regra (para o usuario).' })
  @IsString()
  @IsNotEmpty({ message: 'O nome da regra e obrigatorio' })
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: RULE_MATCH_TYPES, description: 'Como o padrao e comparado com a descricao.' })
  @IsIn(RULE_MATCH_TYPES)
  matchType!: (typeof RULE_MATCH_TYPES)[number];

  @ApiProperty({ example: 'mercado', description: 'Texto procurado na descricao do lancamento.' })
  @IsString()
  @IsNotEmpty({ message: 'O padrao da regra e obrigatorio' })
  @MaxLength(200)
  pattern!: string;

  @ApiProperty({ description: 'Categoria atribuida quando a regra casa.' })
  @IsUUID()
  categoryId!: string;

  @ApiPropertyOptional({ enum: CATEGORIZATION_TARGET_TYPES, description: 'Restringe a receita ou despesa.' })
  @IsOptional()
  @IsIn(CATEGORIZATION_TARGET_TYPES)
  type?: (typeof CATEGORIZATION_TARGET_TYPES)[number];

  @ApiPropertyOptional({ example: 100, description: 'Precedencia (menor aplica antes). Padrao 100.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  priority?: number;
}

export class UpdateCategorizationRuleRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'O nome da regra nao pode ficar vazio' })
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: RULE_MATCH_TYPES })
  @IsOptional()
  @IsIn(RULE_MATCH_TYPES)
  matchType?: (typeof RULE_MATCH_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'O padrao da regra nao pode ficar vazio' })
  @MaxLength(200)
  pattern?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    nullable: true,
    enum: CATEGORIZATION_TARGET_TYPES,
    description: 'Enviar null remove o filtro de tipo (aplica a receita e despesa).',
  })
  @IsOptional()
  @IsIn(CATEGORIZATION_TARGET_TYPES)
  type?: (typeof CATEGORIZATION_TARGET_TYPES)[number] | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  priority?: number;

  @ApiPropertyOptional({ enum: RULE_STATES })
  @IsOptional()
  @IsIn(RULE_STATES)
  state?: (typeof RULE_STATES)[number];

  @ApiPropertyOptional({ description: 'Concorrencia otimista.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  version?: number;
}

export class ListCategorizationRulesQuery {
  @ApiPropertyOptional({ enum: RULE_STATES, description: 'Filtra por situacao da regra.' })
  @IsOptional()
  @IsIn(RULE_STATES)
  state?: (typeof RULE_STATES)[number];
}

export class ApplyCategorizationQuery {
  @ApiPropertyOptional({ example: '2026-06-01', description: 'Inicio da janela (YYYY-MM-DD).' })
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @ApiPropertyOptional({ example: '2026-06-30', description: 'Fim da janela (YYYY-MM-DD).' })
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}
