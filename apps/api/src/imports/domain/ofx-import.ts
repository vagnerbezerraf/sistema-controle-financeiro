/**
 * Domínio puro da importação de extrato em OFX (Open Financial Exchange).
 * Extrai cada `<STMTTRN>` e devolve as linhas no mesmo formato do CSV; a
 * validação e a deduplicação ficam em `import-rows.ts`. Nada aqui acessa o banco.
 * Aceita tanto OFX 1.x (SGML, tags sem fechamento) quanto OFX 2.x (XML).
 *
 * Comentários sem acentos por convenção do projeto.
 */

import { parseAmount, type ImportRowType, type ParsedImportRow } from './import-rows';

/** Tipos de transação do OFX que indicam saída (despesa) quando o valor não é negativo. */
const DEBIT_TRN_TYPES = new Set([
  'DEBIT',
  'CHECK',
  'PAYMENT',
  'FEE',
  'ATM',
  'POS',
  'DIRECTDEBIT',
  'SRVCHG',
  'CASH',
  'REPEATPMT',
]);

/** Decodifica as entidades XML mais comuns nos textos do extrato. */
function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Extrai o valor de uma tag do bloco OFX. O valor vai até o próximo `<` ou fim de
 * linha, o que funciona tanto no SGML (`<MEMO>Mercado`) quanto no XML
 * (`<MEMO>Mercado</MEMO>`).
 */
function tagValue(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i').exec(block);
  if (!match) return null;
  return decodeEntities(match[1].trim());
}

/** Interpreta a data do OFX (`YYYYMMDD[HHMMSS][.sss][tz]`) para `YYYY-MM-DD`. */
export function parseOfxDate(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw
    .trim()
    .replace(/\[.*$/, '')
    .replace(/\..*$/, '')
    .trim();
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(digits);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
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

/**
 * Decide o tipo da linha: o sinal de `TRNAMT` é autoritativo (negativo = saída);
 * quando o valor vem sem sinal, o `TRNTYPE` desempata (DEBIT/PAYMENT/... = saída).
 */
function resolveType(
  rawAmount: string | null,
  trnType: string | null,
): { type: ImportRowType | null; cents: number | null } {
  const parsed = rawAmount ? parseAmount(rawAmount) : null;
  if (!parsed) return { type: null, cents: null };
  if (parsed.negative) return { type: 'expense', cents: parsed.cents };
  const token = (trnType ?? '').trim().toUpperCase();
  if (DEBIT_TRN_TYPES.has(token)) return { type: 'expense', cents: parsed.cents };
  return { type: 'income', cents: parsed.cents };
}

/** Interpreta o texto do OFX em linhas (com os erros de validação de cada uma). */
export function parseOfx(text: string): ParsedImportRow[] {
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  return blocks.map((block, index) => {
    const errors: string[] = [];

    const date = parseOfxDate(tagValue(block, 'DTPOSTED'));
    if (!date) errors.push('data_invalida');

    const description = (tagValue(block, 'MEMO') ?? tagValue(block, 'NAME') ?? '').trim();
    if (!description) errors.push('descricao_ausente');

    const { type, cents } = resolveType(tagValue(block, 'TRNAMT'), tagValue(block, 'TRNTYPE'));
    if (cents === null) errors.push('valor_invalido');

    return {
      line: index + 1,
      date,
      description,
      amount: cents === null ? null : (cents / 100).toFixed(2),
      type,
      errors,
      fitId: tagValue(block, 'FITID'),
    };
  });
}
