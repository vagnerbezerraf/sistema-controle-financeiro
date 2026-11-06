import { IsEmail, IsIn, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';
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

  @ApiProperty({ required: false, example: '123456', description: 'Codigo TOTP quando o MFA esta ativo' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  mfaCode?: string;
}

export class RefreshTokenRequest {
  @ApiProperty({ example: 'eyJhbGciOi...' })
  @IsString()
  refreshToken!: string;
}

export class AuthResponse {
  @ApiProperty({ required: false }) accessToken?: string;
  @ApiProperty({ required: false }) refreshToken?: string;
  @ApiProperty({ required: false }) expiresIn?: number;
  @ApiProperty() tokenType = 'Bearer';
  @ApiProperty({ required: false, description: 'true quando a senha esta correta mas o MFA precisa ser confirmado' })
  mfaRequired?: boolean;
  @ApiProperty({ required: false }) user?: {
    id: string;
    email: string;
    name: string | null;
    timezone: string;
    locale: string;
  };
}

export class MfaCodeRequest {
  @ApiProperty({ example: '123456' })
  @IsString()
  @MaxLength(32)
  code!: string;
}

export class MfaSetupResponse {
  @ApiProperty() secret!: string;
  @ApiProperty() otpauthUrl!: string;
}

export class MfaEnableResponse {
  @ApiProperty({ type: [String] }) recoveryCodes!: string[];
}

export class ForgotPasswordRequest {
  @ApiProperty({ example: 'usuario@exemplo.com' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordRequest {
  @ApiProperty() @IsString() token!: string;

  @ApiProperty({ example: 'SenhaForte!123' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class OidcClientConfigResponse {
  @ApiProperty({ description: 'Indica se ha provedor OIDC configurado' }) enabled!: boolean;
  @ApiProperty() issuer!: string;
  @ApiProperty() clientId!: string;
  @ApiProperty() redirectUri!: string;
  @ApiProperty() scopes!: string;
  @ApiProperty() authorizationEndpoint!: string;
  @ApiProperty({ required: false }) endSessionEndpoint?: string;
}

export class OidcConfigQuery {
  @ApiProperty({ required: false, enum: ['web', 'mobile', 'desktop'], default: 'web' })
  @IsOptional()
  @IsIn(['web', 'mobile', 'desktop'])
  client?: 'web' | 'mobile' | 'desktop';
}

export class OidcExchangeRequest {
  @ApiProperty({ enum: ['web', 'mobile', 'desktop'] })
  @IsIn(['web', 'mobile', 'desktop'])
  client!: 'web' | 'mobile' | 'desktop';

  @ApiProperty() @IsString() code!: string;

  @ApiProperty({ description: 'code_verifier do PKCE' })
  @IsString()
  @MaxLength(256)
  codeVerifier!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  redirectUri?: string;
}
