import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CurrencyCode, PostingDirection, TransactionStatus, TransactionType } from '@prisma/client';

export class PostingInput {
  @ApiProperty()
  @IsUUID()
  accountId!: string;

  @ApiProperty({ example: '42.99' })
  @IsNumberString({}, { message: 'Valor deve ser numerico decimal' })
  amount!: string;

  @ApiProperty({ enum: PostingDirection })
  @IsEnum(PostingDirection)
  direction!: PostingDirection;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString({ strict: true })
  effectiveDate?: string;
}

export class CreateTransactionRequest {
  @ApiProperty({ enum: TransactionType })
  @IsEnum(TransactionType)
  type!: TransactionType;

  @ApiProperty({ required: false, enum: TransactionStatus, default: TransactionStatus.confirmed })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiProperty()
  @IsString()
  @MaxLength(250)
  description!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ required: false, enum: CurrencyCode })
  @IsOptional()
  @IsEnum(CurrencyCode)
  currency?: CurrencyCode;

  @ApiProperty({ example: '42.99' })
  @IsNumberString({}, { message: 'Valor deve ser numerico decimal' })
  totalAmount!: string;

  @ApiProperty({ example: '2026-08-21' })
  @IsDateString({ strict: true })
  effectiveDate!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString({ strict: true })
  dueDate?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ type: [PostingInput] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PostingInput)
  postings!: PostingInput[];
}
