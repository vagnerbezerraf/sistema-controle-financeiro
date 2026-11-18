import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { api, auth, bootstrapUser, createAccount, createCreditCard, createTransaction } from './utils/factory';

/** Compra lancada na conta tecnica do cartao (despesa -> movimento `credit`). */
function purchase(
  app: INestApplication,
  token: string,
  spaceId: string,
  cardAccountId: string,
  amount: string,
  effectiveDate: string,
) {
  return createTransaction(app, token, spaceId, {
    type: 'expense',
    description: `Compra ${effectiveDate}`,
    totalAmount: amount,
    effectiveDate,
    postings: [{ accountId: cardAccountId, amount, direction: 'credit' }],
  });
}

/** Compra (opcionalmente parcelada) pelo endpoint dedicado do cartao. */
function purchaseInstallments(
  app: INestApplication,
  token: string,
  spaceId: string,
  cardId: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
) {
  const req = api(app)
    .post(`/api/v1/financial-spaces/${spaceId}/credit-cards/${cardId}/purchases`)
    .set(auth(token))
    .send(body);
  if (idempotencyKey) req.set('Idempotency-Key', idempotencyKey);
  return req;
}

describe('E2E | Cartoes de credito e faturas', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  it('cria o cartao com uma conta tecnica do tipo credit_card', async () => {
    const user = await bootstrapUser(app);

    const res = await api(app)
      .post(`/api/v1/financial-spaces/${user.spaceId}/credit-cards`)
      .set(auth(user.accessToken))
      .send({ name: 'Nubank', limit: '5000.00', closingDay: 25, dueDay: 5, institution: 'Nubank' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Nubank');
    expect(Number(res.body.limit)).toBe(5000);
    expect(res.body.closingDay).toBe(25);
    expect(res.body.account.type).toBe('credit_card');

    const conta = await prisma.account.findUnique({ where: { id: res.body.accountId } });
    expect(conta?.type).toBe('credit_card');
    // Saldo inicial do cartao e zero: ele representa divida, nao saldo disponivel.
    expect(Number(conta?.initialBalance)).toBe(0);
    // Nenhum ajuste de saldo inicial e criado para o cartao.
    expect(await prisma.transaction.count({ where: { financialSpaceId: user.spaceId } })).toBe(0);
  });

  it('lista e detalha cartoes', async () => {
    const user = await bootstrapUser(app);
    const card = await createCreditCard(app, user.accessToken, user.spaceId, { name: 'Visa' });

    const lista = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/credit-cards`)
      .set(auth(user.accessToken));
    expect(lista.status).toBe(200);
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0].name).toBe('Visa');

    const detalhe = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/credit-cards/${card.id}`)
      .set(auth(user.accessToken));
    expect(detalhe.status).toBe(200);
    expect(detalhe.body.id).toBe(card.id);
    expect(detalhe.body.account.type).toBe('credit_card');
  });

  it('atualiza o cartao com concorrencia otimista na conta tecnica', async () => {
    const user = await bootstrapUser(app);
    const card = await createCreditCard(app, user.accessToken, user.spaceId);
    const url = `/api/v1/financial-spaces/${user.spaceId}/credit-cards/${card.id}`;

    const detalhe = await api(app).get(url).set(auth(user.accessToken));
    expect(detalhe.body.account.version).toBe(0);

    const atualizado = await api(app)
      .patch(url)
      .set(auth(user.accessToken))
      .send({ name: 'Renomeado', limit: '9000.00', closingDay: 20, version: 0 });
    expect(atualizado.status).toBe(200);
    expect(atualizado.body.name).toBe('Renomeado');
    expect(Number(atualizado.body.limit)).toBe(9000);
    expect(atualizado.body.closingDay).toBe(20);
    expect(atualizado.body.account.name).toBe('Renomeado');
    expect(atualizado.body.account.version).toBe(1);

    const desatualizado = await api(app)
      .patch(url)
      .set(auth(user.accessToken))
      .send({ name: 'Escrita perdida', version: 0 });
    expect(desatualizado.status).toBe(409);
    expect(desatualizado.body.code).toBe('STALE_VERSION');
  });

  it('agrupa as compras em faturas pelo ciclo de fechamento', async () => {
    const user = await bootstrapUser(app);
    const card = await createCreditCard(app, user.accessToken, user.spaceId, { closingDay: 25, dueDay: 5 });

    await purchase(app, user.accessToken, user.spaceId, card.accountId, '100.00', '2020-01-10');
    await purchase(app, user.accessToken, user.spaceId, card.accountId, '50.00', '2020-01-20');
    await purchase(app, user.accessToken, user.spaceId, card.accountId, '30.00', '2020-02-10');

    const res = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/credit-cards/${card.id}/invoices`)
      .set(auth(user.accessToken));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    // Mais recente primeiro: fechamento em 25/02.
    const [fev, jan] = res.body;
    expect(fev.id).toBe('2020-02-25');
    expect(fev.totalAmount).toBe('30.00');
    expect(fev.cycleStart).toBe('2020-01-26');
    expect(fev.cycleEnd).toBe('2020-02-25');
    expect(fev.dueDate).toBe('2020-03-05');

    // Fatura de janeiro soma as duas compras dentro do ciclo.
    expect(jan.id).toBe('2020-01-25');
    expect(jan.totalAmount).toBe('150.00');
    expect(jan.outstandingAmount).toBe('150.00');
    expect(jan.status).toBe('overdue');
  });

  it('paga a fatura por transferencia sem duplicar a despesa', async () => {
    const user = await bootstrapUser(app);
    const card = await createCreditCard(app, user.accessToken, user.spaceId, { closingDay: 25, dueDay: 5 });
    const conta = await createAccount(app, user.accessToken, user.spaceId, {
      name: 'Corrente',
      initialBalance: '1000.00',
      initialBalanceDate: '2020-01-01',
    });

    await purchase(app, user.accessToken, user.spaceId, card.accountId, '100.00', '2020-01-10');

    const res = await api(app)
      .post(`/api/v1/financial-spaces/${user.spaceId}/credit-cards/${card.id}/invoices/2020-01-25/pay`)
      .set(auth(user.accessToken))
      .send({ fromAccountId: conta.id, effectiveDate: '2020-02-01' });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('transfer');
    expect(Number(res.body.totalAmount)).toBe(100);
    expect(res.body.postings).toHaveLength(2);
    // Debita a conta do cartao (reduz a divida) e credita a conta de origem.
    const noCartao = res.body.postings.find((p: { accountId: string }) => p.accountId === card.accountId);
    expect(noCartao.direction).toBe('debit');
    const naOrigem = res.body.postings.find((p: { accountId: string }) => p.accountId === conta.id);
    expect(naOrigem.direction).toBe('credit');

    // A despesa continua unica: o pagamento nao vira uma segunda despesa.
    const despesas = await prisma.transaction.count({
      where: { financialSpaceId: user.spaceId, type: 'expense' },
    });
    expect(despesas).toBe(1);

    const fatura = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/credit-cards/${card.id}/invoices/2020-01-25`)
      .set(auth(user.accessToken));
    expect(fatura.body.status).toBe('paid');
    expect(fatura.body.paidAmount).toBe('100.00');
    expect(fatura.body.outstandingAmount).toBe('0.00');
  });

  it('aceita pagamento parcial e mantem o saldo devedor restante', async () => {
    const user = await bootstrapUser(app);
    const card = await createCreditCard(app, user.accessToken, user.spaceId, { closingDay: 25, dueDay: 5 });
    const conta = await createAccount(app, user.accessToken, user.spaceId, { name: 'Corrente' });

    await purchase(app, user.accessToken, user.spaceId, card.accountId, '100.00', '2020-01-10');

    const res = await api(app)
      .post(`/api/v1/financial-spaces/${user.spaceId}/credit-cards/${card.id}/invoices/2020-01-25/pay`)
      .set(auth(user.accessToken))
      .send({ fromAccountId: conta.id, amount: '40.00', effectiveDate: '2020-02-01' });
    expect(res.status).toBe(201);

    const fatura = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/credit-cards/${card.id}/invoices/2020-01-25`)
      .set(auth(user.accessToken));
    expect(fatura.body.paidAmount).toBe('40.00');
    expect(fatura.body.outstandingAmount).toBe('60.00');
    expect(fatura.body.status).toBe('overdue');
  });

  it('recusa pagamento invalido: conta do cartao, fatura inexistente e fatura quitada', async () => {
    const user = await bootstrapUser(app);
    const card = await createCreditCard(app, user.accessToken, user.spaceId);
    const conta = await createAccount(app, user.accessToken, user.spaceId, { name: 'Corrente' });
    await purchase(app, user.accessToken, user.spaceId, card.accountId, '10.00', '2020-01-10');
    const base = `/api/v1/financial-spaces/${user.spaceId}/credit-cards/${card.id}/invoices/2020-01-25/pay`;

    const mesmaConta = await api(app)
      .post(base)
      .set(auth(user.accessToken))
      .send({ fromAccountId: card.accountId });
    expect(mesmaConta.status).toBe(400);
    expect(mesmaConta.body.code).toBe('INVALID_SOURCE_ACCOUNT');

    // A fatura de 25/04 nao existe (nao ha compras nesse ciclo).
    const semFatura = await api(app)
      .post(`/api/v1/financial-spaces/${user.spaceId}/credit-cards/${card.id}/invoices/2020-04-25/pay`)
      .set(auth(user.accessToken))
      .send({ fromAccountId: conta.id });
    expect(semFatura.status).toBe(404);

    // Quita a fatura e tenta pagar de novo: nao ha saldo devedor.
    const quitacao = await api(app)
      .post(base)
      .set(auth(user.accessToken))
      .send({ fromAccountId: conta.id });
    expect(quitacao.status).toBe(201);

    const jaPaga = await api(app)
      .post(base)
      .set(auth(user.accessToken))
      .send({ fromAccountId: conta.id });
    expect(jaPaga.status).toBe(400);
    expect(jaPaga.body.code).toBe('NOTHING_TO_PAY');
  });

  it('valida o dia de fechamento e o cartao inexistente', async () => {
    const user = await bootstrapUser(app);

    const invalido = await api(app)
      .post(`/api/v1/financial-spaces/${user.spaceId}/credit-cards`)
      .set(auth(user.accessToken))
      .send({ name: 'Invalido', limit: '100.00', closingDay: 40, dueDay: 5 });
    expect(invalido.status).toBe(400);

    const inexistente = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/credit-cards/00000000-0000-0000-0000-000000000000`)
      .set(auth(user.accessToken));
    expect(inexistente.status).toBe(404);
  });

  it('lanca a compra parcelada com a soma igual ao total e cada parcela na fatura esperada', async () => {
    const user = await bootstrapUser(app);
    const card = await createCreditCard(app, user.accessToken, user.spaceId, { closingDay: 25, dueDay: 5 });

    const res = await purchaseInstallments(app, user.accessToken, user.spaceId, card.id, {
      description: 'Notebook',
      totalAmount: '1000.00',
      installments: 3,
      purchaseDate: '2020-01-10',
    });

    expect(res.status).toBe(201);
    expect(res.body.installments).toBe(3);
    expect(res.body.totalAmount).toBe('1000.00');
    expect(res.body.purchaseDate).toBe('2020-01-10');
    expect(res.body.installmentGroupId).toEqual(expect.any(String));
    expect(res.body.transactions).toHaveLength(3);

    const parcelas = res.body.transactions as Array<{
      description: string;
      totalAmount: string;
      effectiveDate: string;
      installmentGroupId: string;
      installmentNumber: number;
      installmentCount: number;
    }>;
    // A sobra de arredondamento vai para a primeira parcela; a soma e exata.
    expect(parcelas.map((p) => p.totalAmount)).toEqual(['333.34', '333.33', '333.33']);
    expect(parcelas.reduce((acc, p) => acc + Number(p.totalAmount), 0)).toBeCloseTo(1000, 2);
    expect(parcelas.map((p) => p.description)).toEqual(['Notebook (1/3)', 'Notebook (2/3)', 'Notebook (3/3)']);
    expect(parcelas.map((p) => p.effectiveDate.slice(0, 10))).toEqual([
      '2020-01-10',
      '2020-02-10',
      '2020-03-10',
    ]);
    // Todas as parcelas apontam para o mesmo grupo e se numeram em ordem.
    const grupos = new Set(parcelas.map((p) => p.installmentGroupId));
    expect(grupos.size).toBe(1);
    expect(parcelas.map((p) => p.installmentNumber)).toEqual([1, 2, 3]);
    expect(parcelas.every((p) => p.installmentCount === 3)).toBe(true);

    // Cada parcela caiu no ciclo da sua competencia (fechamento dia 25).
    const faturas = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/credit-cards/${card.id}/invoices`)
      .set(auth(user.accessToken));
    expect(faturas.status).toBe(200);
    const porFechamento = Object.fromEntries(
      (faturas.body as Array<{ id: string; totalAmount: string }>).map((f) => [f.id, f.totalAmount]),
    );
    expect(porFechamento).toEqual({
      '2020-01-25': '333.34',
      '2020-02-25': '333.33',
      '2020-03-25': '333.33',
    });

    // A despesa total continua igual a compra: tres parcelas, nenhuma duplicacao.
    const despesas = await prisma.transaction.findMany({
      where: { financialSpaceId: user.spaceId, type: 'expense' },
    });
    expect(despesas).toHaveLength(3);
  });

  it('lanca compra a vista (installments = 1) sem metadados de parcelamento', async () => {
    const user = await bootstrapUser(app);
    const card = await createCreditCard(app, user.accessToken, user.spaceId, { closingDay: 25, dueDay: 5 });

    const res = await purchaseInstallments(app, user.accessToken, user.spaceId, card.id, {
      description: 'Cafe',
      totalAmount: '25.00',
      installments: 1,
      purchaseDate: '2020-01-10',
    });

    expect(res.status).toBe(201);
    expect(res.body.installmentGroupId).toBeNull();
    expect(res.body.transactions).toHaveLength(1);
    expect(res.body.transactions[0].description).toBe('Cafe');
    expect(res.body.transactions[0].installmentGroupId).toBeNull();
    expect(res.body.transactions[0].installmentNumber).toBeNull();
    expect(res.body.transactions[0].installmentCount).toBeNull();

    const fatura = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/credit-cards/${card.id}/invoices/2020-01-25`)
      .set(auth(user.accessToken));
    expect(fatura.body.totalAmount).toBe('25.00');
  });

  it('recusa parcelamento invalido, valor nao positivo e cartao inexistente', async () => {
    const user = await bootstrapUser(app);
    const card = await createCreditCard(app, user.accessToken, user.spaceId);

    const zeroParcelas = await purchaseInstallments(app, user.accessToken, user.spaceId, card.id, {
      description: 'Invalido',
      totalAmount: '100.00',
      installments: 0,
    });
    expect(zeroParcelas.status).toBe(400);

    const muitasParcelas = await purchaseInstallments(app, user.accessToken, user.spaceId, card.id, {
      description: 'Invalido',
      totalAmount: '100.00',
      installments: 49,
    });
    expect(muitasParcelas.status).toBe(400);

    const valorZero = await purchaseInstallments(app, user.accessToken, user.spaceId, card.id, {
      description: 'Invalido',
      totalAmount: '0.00',
      installments: 3,
    });
    expect(valorZero.status).toBe(400);
    expect(valorZero.body.code).toBe('INVALID_AMOUNT');

    const cartaoInexistente = await purchaseInstallments(
      app,
      user.accessToken,
      user.spaceId,
      '00000000-0000-0000-0000-000000000000',
      { description: 'Invalido', totalAmount: '100.00', installments: 2 },
    );
    expect(cartaoInexistente.status).toBe(404);
  });

  it('reexecuta a compra parcelada com a mesma Idempotency-Key sem duplicar parcelas', async () => {
    const user = await bootstrapUser(app);
    const card = await createCreditCard(app, user.accessToken, user.spaceId, { closingDay: 25, dueDay: 5 });
    const body = {
      description: 'Sofa',
      totalAmount: '900.00',
      installments: 3,
      purchaseDate: '2020-01-10',
    };
    const key = 'idem-parcelado-1';

    const primeira = await purchaseInstallments(app, user.accessToken, user.spaceId, card.id, body, key);
    expect(primeira.status).toBe(201);

    const segunda = await purchaseInstallments(app, user.accessToken, user.spaceId, card.id, body, key);
    expect(segunda.status).toBe(201);
    expect(segunda.body.installmentGroupId).toBe(primeira.body.installmentGroupId);

    const despesas = await prisma.transaction.count({
      where: { financialSpaceId: user.spaceId, type: 'expense' },
    });
    expect(despesas).toBe(3);
  });
});
