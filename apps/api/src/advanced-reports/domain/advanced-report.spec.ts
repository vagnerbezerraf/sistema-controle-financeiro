import { describe, expect, it } from 'vitest';
import {
  buildEvolution,
  computeNetWorth,
  computeSavingsRate,
  isLiabilityAccount,
  recentMonths,
  type NetWorthAccountInput,
} from './advanced-report';

const conta = (over: Partial<NetWorthAccountInput> = {}): NetWorthAccountInput => ({
  id: 'acc-1',
  name: 'Conta corrente',
  type: 'checking',
  currency: 'BRL',
  balance: '1000.00',
  // Por padrao a conta ja esta na moeda de reporte (saldo igual ao convertido).
  balanceInBase: over.balance ?? '1000.00',
  ...over,
});

describe('advanced-report · patrimonio liquido', () => {
  it('trata cartao de credito como passivo e as demais contas como ativos', () => {
    expect(isLiabilityAccount('credit_card')).toBe(true);
    expect(isLiabilityAccount('checking')).toBe(false);
    expect(isLiabilityAccount('investment')).toBe(false);
  });

  it('soma ativos, passivos (modulo da divida) e o patrimonio liquido', () => {
    const view = computeNetWorth('BRL', [
      conta({ id: 'a1', balance: '1000.00' }),
      conta({ id: 'a2', type: 'savings', balance: '500.00' }),
      conta({ id: 'c1', type: 'credit_card', balance: '-300.00' }),
    ]);

    expect(view.currency).toBe('BRL');
    expect(view.assets).toBe('1500.00');
    expect(view.liabilities).toBe('300.00');
    expect(view.netWorth).toBe('1200.00');
    expect(view.accounts).toHaveLength(3);
    expect(view.accounts[2]).toEqual({
      accountId: 'c1',
      name: 'Conta corrente',
      type: 'credit_card',
      currency: 'BRL',
      balance: '-300.00',
      balanceInBase: '-300.00',
    });
  });

  it('soma pelo saldo convertido, preservando a moeda da conta', () => {
    const view = computeNetWorth('BRL', [
      conta({ id: 'a1', currency: 'USD', balance: '100.00', balanceInBase: '500.00' }),
    ]);

    expect(view.assets).toBe('500.00');
    expect(view.accounts[0]).toMatchObject({ currency: 'USD', balance: '100.00', balanceInBase: '500.00' });
  });

  it('mantem a conta listada mas fora das somas quando nao ha taxa de cambio', () => {
    const view = computeNetWorth('BRL', [
      conta({ id: 'a1', currency: 'USD', balance: '100.00', balanceInBase: null }),
    ]);

    expect(view.assets).toBe('0.00');
    expect(view.netWorth).toBe('0.00');
    expect(view.accounts[0]).toMatchObject({ currency: 'USD', balance: '100.00', balanceInBase: null });
  });

  it('nao transforma credito a favor no cartao em passivo negativo', () => {
    const view = computeNetWorth('BRL', [conta({ type: 'credit_card', balance: '50.00' })]);

    expect(view.assets).toBe('0.00');
    expect(view.liabilities).toBe('0.00');
    expect(view.netWorth).toBe('0.00');
  });

  it('devolve zeros quando nao ha contas', () => {
    const view = computeNetWorth('BRL', []);

    expect(view).toEqual({
      currency: 'BRL',
      assets: '0.00',
      liabilities: '0.00',
      netWorth: '0.00',
      accounts: [],
    });
  });
});

describe('advanced-report · taxa de poupanca', () => {
  it('calcula o que sobrou e o percentual sobre as receitas', () => {
    const view = computeSavingsRate('2026-06', '2000.00', '1500.00');

    expect(view).toEqual({
      month: '2026-06',
      income: '2000.00',
      expense: '1500.00',
      saved: '500.00',
      rate: 25,
    });
  });

  it('devolve taxa nula quando nao houve receita', () => {
    const view = computeSavingsRate('2026-06', '0.00', '400.00');

    expect(view.saved).toBe('-400.00');
    expect(view.rate).toBeNull();
  });

  it('aceita poupanca negativa (gastou mais do que ganhou)', () => {
    const view = computeSavingsRate('2026-06', '1000.00', '1200.00');

    expect(view.saved).toBe('-200.00');
    expect(view.rate).toBe(-20);
  });
});

describe('advanced-report · evolucao mensal', () => {
  it('lista os meses em ordem crescente terminando no mes informado', () => {
    expect(recentMonths('2026-06', 6)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
    expect(recentMonths('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });

  it('zera os meses sem movimento e calcula o liquido', () => {
    const evolution = buildEvolution(['2026-05', '2026-06', '2026-07'], {
      '2026-06': { income: '1200.00', expense: '900.00' },
      '2026-07': { income: '0.00', expense: '200.00' },
    });

    expect(evolution).toEqual([
      { month: '2026-05', income: '0.00', expense: '0.00', net: '0.00' },
      { month: '2026-06', income: '1200.00', expense: '900.00', net: '300.00' },
      { month: '2026-07', income: '0.00', expense: '200.00', net: '-200.00' },
    ]);
  });
});
