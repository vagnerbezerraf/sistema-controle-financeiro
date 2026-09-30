import { registerAs } from '@nestjs/config';
import { z } from 'zod';

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

  DATABASE_URL: z.string().min(1),

  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(3600),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(86400 * 14),

  OIDC_ISSUER_URL: z.string().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),

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
