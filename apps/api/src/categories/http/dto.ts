import { IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CategoryType } from '@prisma/client';

export class CreateCategoryRequest {
  @ApiProperty()
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ enum: CategoryType })
  @IsEnum(CategoryType)
  type!: CategoryType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class UpdateCategoryRequest {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiProperty({ required: false, enum: CategoryType })
  @IsOptional()
  @IsEnum(CategoryType)
  type?: CategoryType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiProperty({
    required: false,
    description: 'Versao atual da categoria (concorrencia otimista). Se divergir, responde 409 STALE_VERSION.',
    example: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  version?: number;
}
