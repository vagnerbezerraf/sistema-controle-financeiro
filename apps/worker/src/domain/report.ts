/**
 * Dominio puro da geracao de relatorios no worker (Fase 5).
 *
 * A API apenas enfileira o pedido; quem produz o conteudo e este worker. Aqui
 * ficam as partes deterministicas (montar o CSV, nomear o arquivo, resumir o
 * erro) — sem banco e sem relogio global — para serem testadas isoladamente.
 */

/** Teto de linhas por relatorio, para nao gerar um arquivo ilimitado. */
export const MAX_REPORT_ROWS = 10_000;

/** Cabecalho do CSV de lancamentos (mesmas colunas da exportacao sincrona). */
export const REPORT_CSV_HEADER = [
  'data',
  'tipo',
  'situacao',
  'descricao',
  'categoria',
  'contas',
  'valor',
  'moeda',
];

/** Versao achatada de um lancamento, ja pronta para virar linha de CSV. */
export interface ReportTransactionLike {
  effectiveDate: Date;
  type: string;
  status: string;
  description: string;
  /** Valor total com 2 casas decimais. */
  amount: string;
  currency: string;
  categoryName: string | null;
  accountNames: string[];
}

/** Filtros do pedido gravados pela API (periodo inclusivo). */
export interface ReportParamsLike {
  from?: string;
  to?: string;
}

/** Escapa um campo para CSV (RFC 4180): aspas duplicadas e campos envoltos. */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Serializa uma matriz de linhas em CSV (uma linha por array, com CRLF). */
export function toCsv(rows: Array<Array<unknown>>): string {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
}

/** Nome do arquivo baixado, derivado do periodo do pedido. */
export function reportFileName(params: ReportParamsLike): string {
  const range = [params.from, params.to].filter(Boolean).join('_');
  return range ? `transacoes-${range}.csv` : 'transacoes.csv';
}

/**
 * Monta o CSV de lancamentos. Comeca com o BOM para o Excel reconhecer o UTF-8
 * e exibir acentos corretamente (mesmo criterio da exportacao sincrona).
 */
export function buildTransactionsCsv(rows: ReportTransactionLike[]): string {
  const lines: Array<Array<unknown>> = [
    REPORT_CSV_HEADER,
    ...rows.map((row) => [
      row.effectiveDate.toISOString().slice(0, 10),
      row.type,
      row.status,
      row.description,
      row.categoryName ?? '',
      row.accountNames.join(' | '),
      row.amount,
      row.currency,
    ]),
  ];
  return `\uFEFF${toCsv(lines)}`;
}

/** Resume a mensagem de erro para caber na coluna `error` do job. */
export function truncateError(message: string, max = 500): string {
  const text = message.trim() || 'Falha desconhecida ao gerar o relatorio';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
