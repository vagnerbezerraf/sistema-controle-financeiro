import { z } from 'zod';

export const CurrencyCode = z.enum(['BRL', 'USD', 'EUR', 'ARS', 'GBP', 'JPY']);
export type CurrencyCode = z.infer<typeof CurrencyCode>;

export const MoneyAmount = z.string().regex(/^\d+(\.\d{1,4})?$/, {
  message: 'Valor monetario deve ser decimal com ate 4 casas',
});
export type MoneyAmount = z.infer<typeof MoneyAmount>;

export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: 'Data deve estar no formato YYYY-MM-DD',
});
export type IsoDate = z.infer<typeof IsoDate>;

export const IsoDateTime = z.string().datetime({ offset: true, message: 'Data/hora deve ser ISO 8601 com fuso' });
export type IsoDateTime = z.infer<typeof IsoDateTime>;

export const UuidSchema = z.string().uuid({ message: 'Identificador invalido' });
export type UuidSchema = z.infer<typeof UuidSchema>;

export const PaginationInput = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(25),
  cursor: z.string().optional(),
});

export const SortOrder = z.enum(['asc', 'desc']);

export const IdempotencyHeaders = z.object({
  'idempotency-key': z.string().min(1).max(128),
});

export const ProblemDetails = z.object({
  type: z.string().url().optional(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: z.string().optional(),
  correlation_id: z.string().optional(),
});

export { z };
