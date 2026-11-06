/**
 * Converte os valores de data aceitos nos contratos da API (`YYYY-MM-DD` ou
 * ISO-8601 completa) para `Date`. O Prisma exige `Date` nos campos `@db.Date`;
 * enviar a string bruta resulta em `PrismaClientValidationError`.
 */
export function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}
