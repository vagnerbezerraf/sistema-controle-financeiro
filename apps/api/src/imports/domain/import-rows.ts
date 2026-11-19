/**
 * Núcleo compartilhado da importação de extrato (CSV e OFX). Interpreta as
 * linhas já extraídas de cada formato, valida e marca duplicidades (dentro do
 * próprio arquivo e contra os lançamentos existentes). Nada aqui acessa o banco:
 * recebe os lançamentos existentes como dados e devolve as linhas classificadas.
 *
 * Comentários sem acentos por convenção do projeto.
 */

export type ImportRowType = 'income' | 'expense';
export type ImportRowStatus = 'valid' | 'invalid' | 'duplicate';
export type DuplicateOrigin = 'file' | 'existing';

/** Linha já interpretada, antes da classificação. */
export interface ParsedImportRow {
  /** Número físico no arquivo (linha do CSV ou ordem do lançamento no OFX). */
  line: number;
  date: string | null;
  description: string;
  /** Valor absoluto com 2 casas (o sinal é dado por `type`). */
  amount: string | null;
  type: ImportRowType | null;
  /** Códigos dos problemas encontrados (ex.: `data_invalida`). */
  errors: string[];
  /** Identificador do lançamento no extrato (FITID no OFX). */
  fitId?: string | null;
}

/** Lançamento já existente, usado na deduplicação. */
export interface ExistingEntry {
  date: string;
  description: string;
  amount: string;
  type: ImportRowType;
}

export interface ClassifiedImportRow extends ParsedImportRow {
  status: ImportRowStatus;
  duplicateOf?: DuplicateOrigin;
}

export interface ImportPreviewResult {
  rows: ClassifiedImportRow[];
  summary: { total: number; valid: number; invalid: number; duplicates: number };
}

/** Remove acentos, apara e baixa a caixa (para comparar cabeçalhos e tipo). */
export function normalizeToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/** Texto normalizado para comparar descrições na deduplicação. */
function normalizeDescription(value: string): string {
  return normalizeToken(value).replace(/\s+/g, ' ');
}

/** Converte um valor monetário (texto) em centavos. */
export function toCents(amount: string): number {
  return Math.round(Number(amount) * 100);
}

/** Chave de deduplicação: data + tipo + valor (centavos) + descrição normalizada. */
function entryKey(date: string, type: ImportRowType, amountCents: number, description: string): string {
  return `${date}|${type}|${amountCents}|${normalizeDescription(description)}`;
}

/**
 * Interpreta um valor monetário aceitando separadores pt-BR e en-US, símbolo de
 * moeda, sinal negativo e parênteses contábeis. Devolve o valor absoluto em
 * centavos junto do sinal detectado.
 */
export function parseAmount(raw: string): { cents: number; negative: boolean } | null {
  let value = raw.trim();
  if (!value) return null;

  let negative = false;
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1);
  }
  value = value.replace(/R\$/gi, '').replace(/\s|\u00a0/g, '');
  if (value.startsWith('-')) {
    negative = true;
    value = value.slice(1);
  } else if (value.startsWith('+')) {
    value = value.slice(1);
  }
  if (!value) return null;

  const hasDot = value.includes('.');
  const hasComma = value.includes(',');
  let normalized: string;
  if (hasDot && hasComma) {
    normalized =
      value.lastIndexOf(',') > value.lastIndexOf('.')
        ? value.replace(/\./g, '').replace(',', '.')
        : value.replace(/,/g, '');
  } else if (hasComma) {
    normalized = /,\d{1,2}$/.test(value) ? value.replace(/,/, '.') : value.replace(/,/g, '');
  } else {
    normalized = value;
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isFinite(cents)) return null;
  return { cents, negative };
}

/**
 * Classifica cada linha como válida, inválida ou duplicada. A duplicidade é
 * checada primeiro contra os lançamentos existentes (mesma data, tipo, valor e
 * descrição) e depois contra as linhas anteriores do próprio arquivo. Quando a
 * linha traz um FITID (OFX), ele é o identificador forte dentro do arquivo.
 */
export function buildImportPreview(parsed: ParsedImportRow[], existing: ExistingEntry[]): ImportPreviewResult {
  const existingKeys = new Set(
    existing.map((entry) => entryKey(entry.date, entry.type, toCents(entry.amount), entry.description)),
  );
  const seenInFileKeys = new Set<string>();
  const seenFitIds = new Set<string>();

  const rows: ClassifiedImportRow[] = parsed.map((row) => {
    if (row.errors.length > 0 || !row.date || !row.amount || !row.type) {
      return { ...row, status: 'invalid' };
    }
    const key = entryKey(row.date, row.type, toCents(row.amount), row.description);
    if (existingKeys.has(key)) {
      return { ...row, status: 'duplicate', duplicateOf: 'existing' };
    }
    if (row.fitId) {
      if (seenFitIds.has(row.fitId)) {
        return { ...row, status: 'duplicate', duplicateOf: 'file' };
      }
      seenFitIds.add(row.fitId);
    } else if (seenInFileKeys.has(key)) {
      return { ...row, status: 'duplicate', duplicateOf: 'file' };
    } else {
      seenInFileKeys.add(key);
    }
    return { ...row, status: 'valid' };
  });

  return {
    rows,
    summary: {
      total: rows.length,
      valid: rows.filter((row) => row.status === 'valid').length,
      invalid: rows.filter((row) => row.status === 'invalid').length,
      duplicates: rows.filter((row) => row.status === 'duplicate').length,
    },
  };
}
