import { Module } from '@nestjs/common';
import { AuthDomainService } from './domain/auth.domain.service';
import { IdentityController } from './http/identity.controller';
import { AuthCommonModule } from '../common/auth/auth.module';

@Module({
  imports: [AuthCommonModule],
  controllers: [IdentityController],
  providers: [AuthDomainService],
  exports: [AuthDomainService],
})
export class IdentityModule {}
