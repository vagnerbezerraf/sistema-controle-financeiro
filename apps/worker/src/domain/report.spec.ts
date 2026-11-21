import { describe, expect, it } from 'vitest';
import {
  buildTransactionsCsv,
  csvEscape,
  REPORT_CSV_HEADER,
  reportFileName,
  toCsv,
  truncateError,
  type ReportTransactionLike,
} from './report';

const lancamento = (over: Partial<ReportTransactionLike> = {}): ReportTransactionLike => ({
  effectiveDate: new Date('2026-11-10T00:00:00.000Z'),
  type: 'expense',
  status: 'confirmed',
  description: 'Mercado',
  amount: '123.45',
  currency: 'BRL',
  categoryName: 'Alimentacao',
  accountNames: ['Conta corrente'],
  ...over,
});

describe('relatorio (dominio do worker)', () => {
  it('escapa campos com virgula, aspas e quebra de linha', () => {
    expect(csvEscape('simples')).toBe('simples');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvEscape('linha1\nlinha2')).toBe('"linha1\nlinha2"');
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });

  it('serializa linhas em CSV com CRLF', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\r\nc,d');
  });

  it('monta o CSV de lancamentos com BOM e cabecalho', () => {
    const csv = buildTransactionsCsv([lancamento()]);
    const linhas = csv.replace('\uFEFF', '').split('\r\n');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(linhas[0]).toBe(REPORT_CSV_HEADER.join(','));
    expect(linhas[1]).toBe('2026-11-10,expense,confirmed,Mercado,Alimentacao,Conta corrente,123.45,BRL');
  });

  it('junta varias contas e deixa a categoria em branco quando ausente', () => {
    const csv = buildTransactionsCsv([
      lancamento({ categoryName: null, accountNames: ['Carteira', 'Banco'] }),
    ]);
    expect(csv).toContain(',,Carteira | Banco,');
  });

  it('gera CSV so com o cabecalho quando nao ha lancamentos', () => {
    const linhas = buildTransactionsCsv([]).replace('\uFEFF', '').split('\r\n');
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toBe(REPORT_CSV_HEADER.join(','));
  });

  it('nomeia o arquivo a partir do periodo', () => {
    expect(reportFileName({ from: '2026-01-01', to: '2026-01-31' })).toBe(
      'transacoes-2026-01-01_2026-01-31.csv',
    );
    expect(reportFileName({})).toBe('transacoes.csv');
  });

  it('resume mensagens de erro longas e vazias', () => {
    expect(truncateError('curto')).toBe('curto');
    expect(truncateError('')).toBe('Falha desconhecida ao gerar o relatorio');
    const longo = truncateError('x'.repeat(600));
    expect(longo.length).toBe(500);
    expect(longo.endsWith('…')).toBe(true);
  });
});
