/**
 * Escapa um campo para CSV segundo a RFC 4180: campos com virgula, aspas ou
 * quebra de linha sao envolvidos em aspas duplas e as aspas internas sao
 * duplicadas. `null`/`undefined` viram string vazia.
 */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Serializa uma matriz de linhas em CSV (uma linha por array, com CRLF). */
export function toCsv(rows: Array<Array<unknown>>): string {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
}
