import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { appConfig } from './config/app.config';
import { PrismaModule } from './common/prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { SpacesModule } from './financial-spaces/financial-spaces.module';
import { AccountsModule } from './accounts/accounts.module';
import { CategoriesModule } from './categories/categories.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard, SpaceRoleGuard } from './common/auth/auth.guard';
import { AuthCommonModule } from './common/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      expandVariables: true,
      envFilePath: ['.env.local', '.env'],
      cache: true,
    }),
    CqrsModule,
    PrismaModule,
    AuthCommonModule,
    HealthModule,
    IdentityModule,
    SpacesModule,
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: SpaceRoleGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
