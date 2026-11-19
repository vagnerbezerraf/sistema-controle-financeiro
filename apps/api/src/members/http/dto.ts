import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { FinancialSpaceRole } from '@prisma/client';

export class CreateSpaceInviteRequest {
  @ApiProperty({ example: 'convidado@exemplo.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: FinancialSpaceRole, example: 'contributor' })
  @IsEnum(FinancialSpaceRole)
  role!: FinancialSpaceRole;
}

export class UpdateMemberRoleRequest {
  @ApiProperty({ enum: FinancialSpaceRole, example: 'admin' })
  @IsEnum(FinancialSpaceRole)
  role!: FinancialSpaceRole;
}

export class AcceptSpaceInviteRequest {
  @ApiProperty({ description: 'Token do convite recebido por e-mail' })
  @IsString()
  @MinLength(8)
  token!: string;
}
