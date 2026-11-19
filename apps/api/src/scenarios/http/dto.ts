import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/** Tipos aceitos em um ajuste de cenario (nao ha transferencia nem ajuste). */
export const SCENARIO_ADJUSTMENT_TYPES = ['income', 'expense'] as const;

export class ScenarioAdjustmentDto {
  @ApiProperty({ example: 'Comprar notebook' })
  @IsString()
  @MaxLength(250)
  description!: string;

  @ApiProperty({ enum: SCENARIO_ADJUSTMENT_TYPES, example: 'expense' })
  @IsIn(SCENARIO_ADJUSTMENT_TYPES)
  type!: (typeof SCENARIO_ADJUSTMENT_TYPES)[number];

  @ApiProperty({ example: '4500.00' })
  @IsNumberString({}, { message: 'Valor deve ser numerico decimal' })
  amount!: string;

  @ApiProperty({ example: '2026-06-20', description: 'Data hipotetica do movimento (YYYY-MM-DD)' })
  @IsDateString({ strict: true })
  date!: string;
}

export class CreateScenarioRequest {
  @ApiProperty({
    required: false,
    default: 30,
    description: 'Horizonte em dias da simulacao (1 a 180). Padrao: 30.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  @Type(() => Number)
  horizonDays?: number;

  @ApiProperty({ type: [ScenarioAdjustmentDto], description: 'Movimentos hipoteticos (ate 50)' })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ScenarioAdjustmentDto)
  adjustments!: ScenarioAdjustmentDto[];
}
