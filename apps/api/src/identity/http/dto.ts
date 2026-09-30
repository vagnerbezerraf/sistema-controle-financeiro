import { IsEmail, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterRequest {
  @ApiProperty({ example: 'usuario@exemplo.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ required: false, example: 'SenhaForte!123' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @ApiProperty({ required: false, example: 'Maria Silva' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({ required: false, example: 'America/Sao_Paulo' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiProperty({ required: false, example: 'pt-BR' })
  @IsOptional()
  @IsString()
  locale?: string;
}

export class LoginRequest {
  @ApiProperty({ example: 'usuario@exemplo.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SenhaForte!123' })
  @IsString()
  password!: string;
}

export class RefreshTokenRequest {
  @ApiProperty({ example: 'eyJhbGciOi...' })
  @IsString()
  refreshToken!: string;
}

export class AuthResponse {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty() expiresIn!: number;
  @ApiProperty() tokenType = 'Bearer';
  @ApiProperty({ required: false }) user?: {
    id: string;
    email: string;
    name: string | null;
    timezone: string;
    locale: string;
  };
}
