import { IsDateString, IsIn, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateGoalRequest {
  @ApiProperty({ example: 'Reserva de emergencia' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: '10000.00' })
  @IsNumberString({}, { message: 'Alvo deve ser numerico decimal' })
  targetAmount!: string;

  @ApiProperty({ required: false, example: '2027-06-30' })
  @IsOptional()
  @IsDateString({ strict: true })
  deadline?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  icon?: string;
}

export class UpdateGoalRequest {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({ required: false, example: '12000.00' })
  @IsOptional()
  @IsNumberString({}, { message: 'Alvo deve ser numerico decimal' })
  targetAmount?: string;

  @ApiProperty({ required: false, nullable: true, description: 'Enviar null remove o prazo.' })
  @IsOptional()
  @IsDateString({ strict: true })
  deadline?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  color?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  icon?: string | null;

  @ApiProperty({ required: false, enum: ['active', 'archived'] })
  @IsOptional()
  @IsIn(['active', 'archived'])
  state?: 'active' | 'archived';
}

export class GoalContributionRequest {
  @ApiProperty({ example: '500.00' })
  @IsNumberString({}, { message: 'Contribuicao deve ser numerico decimal' })
  amount!: string;
}
