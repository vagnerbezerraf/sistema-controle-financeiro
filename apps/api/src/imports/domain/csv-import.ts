/**
 * Domínio puro da importação de extrato em CSV. Interpreta o texto e extrai uma
 * linha por registro; a validação e a deduplicação ficam em `import-rows.ts`
 * (compartilhadas com o OFX). Nada aqui acessa o banco.
 *
 * Comentários sem acentos por convenção do projeto.
 */

import { normalizeToken, parseAmount, type ImportRowType, type ParsedImportRow } from './import-rows';

/** Campos esperados no cabeçalho; aceita sinônimos e ignora acentos/caixa. */
const HEADER_ALIASES: Record<string, keyof ColumnMapping> = {
  data: 'date',
  date: 'date',
  dt: 'date',
  descricao: 'description',
  description: 'description',
  historico: 'description',
  memo: 'description',
  valor: 'amount',
  amount: 'amount',
  value: 'amount',
  tipo: 'type',
  type: 'type',
};

interface ColumnMapping {
  date: number;
  description: number;
  amount: number;
  type: number;
}

const DEFAULT_COLUMNS: ColumnMapping = { date: 0, description: 1, amount: 2, type: 3 };

const INCOME_TYPES = new Set(['receita', 'entrada', 'income', 'credito', 'in', 'c', 'r']);
const EXPENSE_TYPES = new Set(['despesa', 'saida', 'expense', 'debito', 'out', 'd', 's']);

/**
 * Detecta o separador da planilha (`,` ou `;`) contando as ocorrências fora de
 * aspas. Usa-se um único separador por arquivo: sem isso, um valor como `1,50`
 * seria quebrado ao meio em arquivos separados por `;`.
 */
export function detectDelimiter(line: string): ',' | ';' {
  let semicolons = 0;
  let commas = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ';') {
      semicolons += 1;
    } else if (!quoted && char === ',') {
      commas += 1;
    }
  }
  return semicolons > commas ? ';' : ',';
}

/** Divide uma linha de CSV respeitando aspas duplas (RFC 4180 simplificado). */
function splitCsvLine(line: string, delimiter: ',' | ';'): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

/** Interpreta a data (`YYYY-MM-DD` ou `DD/MM/YYYY`) para o formato canônico. */
export function parseDate(raw: string): string | null {
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  let year: number;
  let month: number;
  let day: number;
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (br) {
    year = Number(br[3]);
    month = Number(br[2]);
    day = Number(br[1]);
  } else {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/** Interpreta o tipo da linha; `null` quando o campo existe mas é irreconhecível. */
export function parseType(raw: string): ImportRowType | null {
  const token = normalizeToken(raw);
  if (!token) return null;
  if (INCOME_TYPES.has(token)) return 'income';
  if (EXPENSE_TYPES.has(token)) return 'expense';
  return null;
}

/** Mapeia as colunas a partir do cabeçalho; devolve o índice de cada campo. */
function resolveColumns(header: string[]): ColumnMapping | null {
  const mapping: Partial<ColumnMapping> = {};
  header.forEach((cell, index) => {
    const field = HEADER_ALIASES[normalizeToken(cell)];
    if (field && mapping[field] === undefined) mapping[field] = index;
  });
  const known = Object.keys(mapping).length;
  if (known < 2) return null;
  return {
    date: mapping.date ?? DEFAULT_COLUMNS.date,
    description: mapping.description ?? DEFAULT_COLUMNS.description,
    amount: mapping.amount ?? DEFAULT_COLUMNS.amount,
    type: mapping.type ?? DEFAULT_COLUMNS.type,
  };
}

/** Interpreta o texto do CSV em linhas (com os erros de validação de cada uma). */
export function parseCsv(text: string): ParsedImportRow[] {
  const lines = text.split(/\r\n|\r|\n/);
  let delimiter: ',' | ';' = ',';
  let firstDataIndex = 0;
  let columns = DEFAULT_COLUMNS;

  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].trim()) continue;
    delimiter = detectDelimiter(lines[i]);
    const mapping = resolveColumns(splitCsvLine(lines[i], delimiter));
    if (mapping) {
      columns = mapping;
      firstDataIndex = i + 1;
    } else {
      firstDataIndex = i;
    }
    break;
  }

  const rows: ParsedImportRow[] = [];
  for (let i = firstDataIndex; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const cells = splitCsvLine(raw, delimiter);
    const cell = (index: number): string => cells[index] ?? '';

    const errors: string[] = [];
    const date = parseDate(cell(columns.date));
    if (!date) errors.push('data_invalida');

    const description = cell(columns.description).trim();
    if (!description) errors.push('descricao_ausente');

    const parsedAmount = parseAmount(cell(columns.amount));
    if (!parsedAmount) errors.push('valor_invalido');

    const rawType = cell(columns.type);
    let type: ImportRowType | null = null;
    if (rawType.trim()) {
      type = parseType(rawType);
      if (!type) errors.push('tipo_invalido');
    } else if (parsedAmount) {
      // Sem tipo explícito, o sinal do valor decide: negativo = despesa.
      type = parsedAmount.negative ? 'expense' : 'income';
    }

    rows.push({
      line: i + 1,
      date,
      description,
      amount: parsedAmount ? (parsedAmount.cents / 100).toFixed(2) : null,
      type,
      errors,
    });
  }
  return rows;
}
