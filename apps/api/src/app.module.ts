import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerErrorInterceptor, LoggerModule } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { appConfig } from './config/app.config';
import { PrismaModule } from './common/prisma/prisma.module';
import { MailModule } from './common/mail/mail.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { SpacesModule } from './financial-spaces/financial-spaces.module';
import { AccountsModule } from './accounts/accounts.module';
import { CategoriesModule } from './categories/categories.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CreditCardsModule } from './credit-cards/credit-cards.module';
import { ObligationsModule } from './obligations/obligations.module';
import { BudgetsModule } from './budgets/budgets.module';
import { GoalsModule } from './goals/goals.module';
import { PlanningAlertsModule } from './planning-alerts/planning-alerts.module';
import { MonthlyComparisonModule } from './monthly-comparison/monthly-comparison.module';
import { AdvancedReportsModule } from './advanced-reports/advanced-reports.module';
import { ScenariosModule } from './scenarios/scenario.module';
import { ImportsModule } from './imports/imports.module';
import { CategorizationModule } from './categorization/categorization.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { MembersModule } from './members/members.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { OutboxModule } from './outbox/outbox.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard, SpaceRoleGuard } from './common/auth/auth.guard';
import { AuthCommonModule } from './common/auth/auth.module';
import { TelemetryService } from './telemetry/telemetry.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      expandVariables: true,
      envFilePath: ['.env.local', '.env'],
      cache: true,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          name: 'scf-api',
          level: config.get<string>('app.LOG_LEVEL') ?? 'info',
          genReqId: (req: IncomingMessage, res: ServerResponse) => {
            const id = (req.headers['x-correlation-id'] as string) || randomUUID();
            res.setHeader('x-correlation-id', id);
            return id;
          },
          // Nunca registrar credenciais ou tokens em log.
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
              'req.body.refreshToken',
              'res.headers["set-cookie"]',
            ],
            remove: true,
          },
          autoLogging: {
            // Sondagens de saude nao geram valor em log.
            ignore: (req: IncomingMessage) => req.url === '/health' || req.url === '/healthz',
          },
          transport: config.get<boolean>('app.LOG_PRETTY')
            ? {
                target: 'pino-pretty',
                options: { singleLine: true, translateTime: 'SYS:standard', colorize: true },
              }
            : undefined,
        },
      }),
    }),
    CqrsModule,
    PrismaModule,
    MailModule,
    AuthCommonModule,
    HealthModule,
    IdentityModule,
    SpacesModule,
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
    CreditCardsModule,
    ObligationsModule,
    BudgetsModule,
    GoalsModule,
    PlanningAlertsModule,
    MonthlyComparisonModule,
    AdvancedReportsModule,
    ScenariosModule,
    ImportsModule,
    CategorizationModule,
    ReconciliationModule,
    MembersModule,
    NotificationsModule,
    AttachmentsModule,
    OutboxModule,
  ],
  providers: [
    TelemetryService,
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
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggerErrorInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
