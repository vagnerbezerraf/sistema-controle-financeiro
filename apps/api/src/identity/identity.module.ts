import { Module } from '@nestjs/common';
import { AuthDomainService } from './domain/auth.domain.service';
import { MfaService } from './domain/mfa.service';
import { PasswordResetService } from './domain/password-reset.service';
import { OidcService } from './domain/oidc.service';
import { IdentityController } from './http/identity.controller';
import { AuthCommonModule } from '../common/auth/auth.module';

@Module({
  imports: [AuthCommonModule],
  controllers: [IdentityController],
  providers: [AuthDomainService, MfaService, PasswordResetService, OidcService],
  exports: [AuthDomainService],
})
export class IdentityModule {}
