import { describe, expect, it } from 'vitest';
import {
  buildImportPreview,
  normalizeToken,
  parseAmount,
  toCents,
  type ExistingEntry,
  type ParsedImportRow,
} from './import-rows';
import { parseCsv, parseDate, parseType } from './csv-import';

describe('csv-import', () => {
  describe('normalizeToken', () => {
    it('remove acentos, apara e baixa a caixa', () => {
      expect(normalizeToken('  Descrição ')).toBe('descricao');
      expect(normalizeToken('Historico')).toBe('historico');
    });
  });

  describe('toCents', () => {
    it('converte o valor em centavos arredondando', () => {
      expect(toCents('10.00')).toBe(1000);
      expect(toCents('99.99')).toBe(9999);
      expect(toCents('0.005')).toBe(1);
    });
  });

  describe('parseDate', () => {
    it('aceita o formato ISO', () => {
      expect(parseDate('2026-06-15')).toBe('2026-06-15');
    });

    it('aceita o formato brasileiro', () => {
      expect(parseDate('15/06/2026')).toBe('2026-06-15');
      expect(parseDate('1/2/2026')).toBe('2026-02-01');
    });

    it('rejeita datas inexistentes', () => {
      expect(parseDate('2026-02-30')).toBeNull();
      expect(parseDate('31/02/2026')).toBeNull();
      expect(parseDate('15-06-2026')).toBeNull();
      expect(parseDate('')).toBeNull();
    });
  });

  describe('parseAmount', () => {
    it('interpreta valores pt-BR', () => {
      expect(parseAmount('1.234,56')).toEqual({ cents: 123456, negative: false });
      expect(parseAmount('R$ 10,00')).toEqual({ cents: 1000, negative: false });
    });

    it('interpreta valores en-US', () => {
      expect(parseAmount('1,234.56')).toEqual({ cents: 123456, negative: false });
      expect(parseAmount('10.00')).toEqual({ cents: 1000, negative: false });
    });

    it('detecta o sinal negativo', () => {
      expect(parseAmount('-10,00')).toEqual({ cents: 1000, negative: true });
      expect(parseAmount('(10,00)')).toEqual({ cents: 1000, negative: true });
      expect(parseAmount('+10,00')).toEqual({ cents: 1000, negative: false });
    });

    it('rejeita valores invalidos', () => {
      expect(parseAmount('')).toBeNull();
      expect(parseAmount('abc')).toBeNull();
      expect(parseAmount('10,00,00')).toBeNull();
    });
  });

  describe('parseType', () => {
    it('reconhece receitas e despesas com sinonimos', () => {
      expect(parseType('receita')).toBe('income');
      expect(parseType('Entrada')).toBe('income');
      expect(parseType('C')).toBe('income');
      expect(parseType('despesa')).toBe('expense');
      expect(parseType('Saída')).toBe('expense');
      expect(parseType('D')).toBe('expense');
    });

    it('devolve null quando o campo esta vazio ou e irreconhecivel', () => {
      expect(parseType('')).toBeNull();
      expect(parseType('  ')).toBeNull();
      expect(parseType('qualquer')).toBeNull();
    });
  });

  describe('parseCsv', () => {
    it('detecta o cabecalho com sinonimos e reordena as colunas', () => {
      const csv = ['Valor;Data;Histórico', '100,00;15/06/2026;Mercado'].join('\n');
      const rows = parseCsv(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        line: 2,
        date: '2026-06-15',
        description: 'Mercado',
        amount: '100.00',
        type: 'income',
        errors: [],
      });
    });

    it('sem cabecalho usa a ordem padrao', () => {
      const csv = '2026-06-15;Mercado;-100,00';
      const rows = parseCsv(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        date: '2026-06-15',
        description: 'Mercado',
        amount: '100.00',
        type: 'expense',
      });
    });

    it('usa o sinal do valor quando nao ha coluna de tipo', () => {
      const csv = ['data,descricao,valor', '2026-06-15,Salario,5000.00', '2026-06-16,Mercado,-100.00'].join('\n');
      const rows = parseCsv(csv);
      expect(rows.map((row) => row.type)).toEqual(['income', 'expense']);
      expect(rows.every((row) => row.errors.length === 0)).toBe(true);
    });

    it('acumula os erros de cada linha', () => {
      const csv = [
        'data,descricao,valor,tipo',
        'data-ruim,Mercado,10.00,receita',
        '2026-06-15,,10.00,receita',
        '2026-06-15,Mercado,abc,receita',
        '2026-06-15,Mercado,10.00,sei-la',
      ].join('\n');
      const rows = parseCsv(csv);
      expect(rows[0].errors).toContain('data_invalida');
      expect(rows[1].errors).toContain('descricao_ausente');
      expect(rows[2].errors).toContain('valor_invalido');
      expect(rows[3].errors).toContain('tipo_invalido');
    });

    it('ignora linhas em branco e respeita aspas', () => {
      const csv = [
        'data,descricao,valor,tipo',
        '2026-06-15,"Mercado, padaria",10.00,despesa',
        '',
        '2026-06-16,Feira,20.00,despesa',
      ].join('\n');
      const rows = parseCsv(csv);
      expect(rows).toHaveLength(2);
      expect(rows[0].description).toBe('Mercado, padaria');
      expect(rows[1].line).toBe(4);
    });
  });

  describe('buildImportPreview', () => {
    const linha = (over: Partial<ParsedImportRow> = {}): ParsedImportRow => ({
      line: 2,
      date: '2026-06-15',
      description: 'Mercado',
      amount: '100.00',
      type: 'expense',
      errors: [],
      ...over,
    });

    it('classifica linha valida', () => {
      const result = buildImportPreview([linha()], []);
      expect(result.rows[0].status).toBe('valid');
      expect(result.summary).toEqual({ total: 1, valid: 1, invalid: 0, duplicates: 0 });
    });

    it('classifica linha invalida quando ha erros', () => {
      const result = buildImportPreview([linha({ date: null, errors: ['data_invalida'] })], []);
      expect(result.rows[0].status).toBe('invalid');
      expect(result.summary.invalid).toBe(1);
    });

    it('marca duplicidade contra um lancamento existente', () => {
      const existing: ExistingEntry[] = [
        { date: '2026-06-15', description: 'MERCADO', amount: '100.00', type: 'expense' },
      ];
      const result = buildImportPreview([linha()], existing);
      expect(result.rows[0].status).toBe('duplicate');
      expect(result.rows[0].duplicateOf).toBe('existing');
      expect(result.summary.duplicates).toBe(1);
    });

    it('marca duplicidade dentro do proprio arquivo', () => {
      const result = buildImportPreview([linha({ line: 2 }), linha({ line: 3 })], []);
      expect(result.rows[0].status).toBe('valid');
      expect(result.rows[1].status).toBe('duplicate');
      expect(result.rows[1].duplicateOf).toBe('file');
    });

    it('resume total, validas, invalidas e duplicadas', () => {
      const result = buildImportPreview(
        [
          linha({ line: 2 }),
          linha({ line: 3, description: 'Feira', amount: '50.00' }),
          linha({ line: 4, description: 'Feira', amount: '50.00' }),
          linha({ line: 5, amount: null, errors: ['valor_invalido'] }),
        ],
        [],
      );
      expect(result.summary).toEqual({ total: 4, valid: 2, invalid: 1, duplicates: 1 });
    });
  });
});
