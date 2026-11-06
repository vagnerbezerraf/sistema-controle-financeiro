import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const booleanFlag = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined ? defaultValue : value.toLowerCase() === 'true'));

export const AppConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'homolog', 'production']).default('development'),
  TZ: z.string().default('America/Sao_Paulo'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_BASE_URL: z.string().url().default('http://localhost:3001'),
  API_CORS_ORIGIN: z
    .string()
    .default('http://localhost:3000,http://localhost:1420')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_PRETTY: booleanFlag(false),

  OTEL_ENABLED: booleanFlag(false),
  OTEL_SERVICE_NAME: z.string().default('scf-api'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().default('http://localhost:4318'),

  DATABASE_URL: z.string().min(1),

  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(3600),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(86400 * 14),

  // OIDC (provedor externo tipo Keycloak). Vazio => OIDC desabilitado (MVP JWT local).
  // `OIDC_ISSUER_URL` e a URL PUBLICA (usada pelo navegador para /authorize).
  // `OIDC_INTERNAL_ISSUER_URL` e a URL alcancada pela API para trocar o code
  // (dentro do Docker: http://keycloak:8080/realms/scf). Se ausente usa a publica.
  OIDC_ISSUER_URL: z.string().default(''),
  OIDC_INTERNAL_ISSUER_URL: z.string().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_CLIENT_ID_WEB: z.string().default('scf-web'),
  OIDC_CLIENT_ID_MOBILE: z.string().default('scf-mobile'),
  OIDC_REDIRECT_URI_WEB: z.string().default('http://localhost:3000/auth/callback'),
  OIDC_REDIRECT_URI_MOBILE: z.string().default('scf-mobile://auth/callback'),
  OIDC_REDIRECT_URI_DESKTOP: z.string().default('scf://auth/callback'),
  OIDC_SCOPES: z.string().default('openid profile email'),

  // MFA (TOTP). `MFA_ISSUER` aparece no app autenticador do usuario.
  MFA_ISSUER: z.string().default('SCF'),
  MFA_ISSUER_EMAIL: z.string().default('no-reply@scf.local'),

  // Envio de e-mail (recuperacao de senha). Em dev usamos MailHog (SMTP :1025).
  MAIL_ENABLED: booleanFlag(false),
  MAIL_HOST: z.string().default('localhost'),
  MAIL_PORT: z.coerce.number().int().positive().default(1025),
  MAIL_SECURE: booleanFlag(false),
  MAIL_USER: z.string().optional(),
  MAIL_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('SCF <no-reply@scf.local>'),

  // URL publica do app web, usada para montar o link de redefinicao de senha.
  WEB_APP_URL: z.string().url().default('http://localhost:3000'),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(60),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
});

export type AppConfigType = z.infer<typeof AppConfigSchema>;

export const appConfig = registerAs('app', () => {
  const parsed = AppConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuracao invalida:\n${details}`);
  }
  return parsed.data;
});
