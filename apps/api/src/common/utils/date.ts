/**
 * Converte os valores de data aceitos nos contratos da API (`YYYY-MM-DD` ou
 * ISO-8601 completa) para `Date`. O Prisma exige `Date` nos campos `@db.Date`;
 * enviar a string bruta resulta em `PrismaClientValidationError`.
 */
export function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Inicio do dia em UTC. As colunas `@db.Date` sao gravadas a meia-noite UTC,
 * entao comparacoes de janela (`dueDate >= hoje`) precisam do mesmo referencial.
 */
export function startOfUtcDay(value: string | Date = new Date()): Date {
  const date = toDate(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
