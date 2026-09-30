import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtAuthGuard, SpaceRoleGuard } from './auth.guard';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('app.JWT_SECRET'),
        signOptions: {
          algorithm: 'HS256',
          issuer: 'scf-api',
          audience: 'scf-clients',
        },
        verifyOptions: {
          algorithms: ['HS256'],
          issuer: 'scf-api',
          audience: 'scf-clients',
        },
      }),
    }),
  ],
  providers: [
    JwtAuthGuard,
    SpaceRoleGuard,
  ],
  exports: [JwtModule, JwtAuthGuard, SpaceRoleGuard],
})
export class AuthCommonModule {}
