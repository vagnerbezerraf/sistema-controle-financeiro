import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import { api, auth, bootstrapUser, createAccount, createTransaction } from './utils/factory';

const recurrenceUrl = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/recurrences`;
const obligationUrl = (spaceId: string) => `/api/v1/financial-spaces/${spaceId}/obligations`;

function createRecurrence(
  app: INestApplication,
  token: string,
  spaceId: string,
  body: Record<string, unknown>,
) {
  return api(app).post(recurrenceUrl(spaceId)).set(auth(token)).send(body);
}

function generateRecurrence(
  app: INestApplication,
  token: string,
  spaceId: string,
  ruleId: string,
  body: Record<string, unknown> = {},
) {
  return api(app)
    .post(`${recurrenceUrl(spaceId)}/${ruleId}/generate`)
    .set(auth(token))
    .send(body);
}

function createObligation(
  app: INestApplication,
  token: string,
  spaceId: string,
  body: Record<string, unknown>,
) {
  return api(app).post(obligationUrl(spaceId)).set(auth(token)).send(body);
}

function listObligations(app: INestApplication, token: string, spaceId: string, query = '') {
  return api(app).get(`${obligationUrl(spaceId)}${query}`).set(auth(token));
}

describe('E2E | Recorrencias e obrigacoes', () => {
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

  it('cria a recorrencia mensal e materializa as previsoes ate o horizonte', async () => {
    const user = await bootstrapUser(app);

    const res = await createRecurrence(app, user.accessToken, user.spaceId, {
      frequency: 'monthly',
      startDate: '2026-01-10',
      generateUpTo: '2026-06-30',
      template: { type: 'expense', description: 'Aluguel', amount: '1800.00' },
    });

    expect(res.status).toBe(201);
    expect(res.body.generatedCount).toBe(6);
    expect(res.body.version).toBe(0);
    expect(res.body.interval).toBe(1);
    expect(res.body.template.description).toBe('Aluguel');

    const lista = await listObligations(
      app,
      user.accessToken,
      user.spaceId,
      `?recurrenceRuleId=${res.body.id}`,
    );
    expect(lista.status).toBe(200);
    expect(lista.body).toHaveLength(6);
    expect(lista.body.map((o: { dueDate: string }) => o.dueDate)).toEqual([
      '2026-01-10',
      '2026-02-10',
      '2026-03-10',
      '2026-04-10',
      '2026-05-10',
      '2026-06-10',
    ]);
    expect(lista.body.every((o: { status: string }) => o.status === 'forecast')).toBe(true);
    expect(lista.body.every((o: { amount: string }) => o.amount === '1800')).toBe(true);
  });

  it('nao duplica as obrigacoes ao regenerar (materializacao idempotente)', async () => {
    const user = await bootstrapUser(app);
    const rule = await createRecurrence(app, user.accessToken, user.spaceId, {
      frequency: 'monthly',
      startDate: '2026-01-10',
      generateUpTo: '2026-06-30',
      template: { type: 'expense', description: 'Aluguel', amount: '1800.00' },
    });
    expect(rule.body.generatedCount).toBe(6);

    const again = await generateRecurrence(app, user.accessToken, user.spaceId, rule.body.id, {
      upTo: '2026-06-30',
    });
    expect(again.status).toBe(201);
    expect(again.body.generatedCount).toBe(0);
    expect(again.body.plannedCount).toBe(6);
    expect(again.body.horizon).toBe('2026-06-30');

    const total = await prisma.obligation.count({ where: { recurrenceRuleId: rule.body.id } });
    expect(total).toBe(6);
  });

  it('respeita endDate, occurrencesLimit e o intervalo entre ocorrencias', async () => {
    const user = await bootstrapUser(app);

    const porLimite = await createRecurrence(app, user.accessToken, user.spaceId, {
      frequency: 'monthly',
      occurrencesLimit: 2,
      startDate: '2026-01-10',
      generateUpTo: '2026-12-31',
      template: { type: 'income', description: 'Salario', amount: '9000.00' },
    });
    expect(porLimite.body.generatedCount).toBe(2);

    const porFim = await createRecurrence(app, user.accessToken, user.spaceId, {
      frequency: 'weekly',
      startDate: '2026-01-05',
      endDate: '2026-01-26',
      generateUpTo: '2026-12-31',
      template: { type: 'expense', description: 'Feira', amount: '120.00' },
    });
    // Semanais em 05, 12, 19 e 26 de janeiro.
    expect(porFim.body.generatedCount).toBe(4);

    const porIntervalo = await createRecurrence(app, user.accessToken, user.spaceId, {
      frequency: 'monthly',
      interval: 2,
      startDate: '2026-01-10',
      generateUpTo: '2026-06-30',
      template: { type: 'expense', description: 'Bimestral', amount: '50.00' },
    });
    // Jan, mar e mai (a cada dois meses).
    expect(porIntervalo.body.generatedCount).toBe(3);
  });

  it('atualiza a regra com concorrencia otimista e gera novas ocorrencias', async () => {
    const user = await bootstrapUser(app);
    const rule = await createRecurrence(app, user.accessToken, user.spaceId, {
      frequency: 'monthly',
      startDate: '2026-01-10',
      generateUpTo: '2026-03-31',
      template: { type: 'expense', description: 'Assinatura', amount: '39.90' },
    });
    expect(rule.body.generatedCount).toBe(3);

    const url = `${recurrenceUrl(user.spaceId)}/${rule.body.id}`;
    const atualizado = await api(app)
      .patch(url)
      .set(auth(user.accessToken))
      .send({ interval: 2, generateUpTo: '2026-06-30', version: 0 });
    expect(atualizado.status).toBe(200);
    expect(atualizado.body.interval).toBe(2);
    expect(atualizado.body.version).toBe(1);
    // Nova agenda (jan, mar, mai): apenas 10/05 ainda nao existia.
    expect(atualizado.body.generatedCount).toBe(1);

    const desatualizado = await api(app)
      .patch(url)
      .set(auth(user.accessToken))
      .send({ interval: 3, version: 0 });
    expect(desatualizado.status).toBe(409);
    expect(desatualizado.body.code).toBe('STALE_VERSION');
  });

  it('arquiva a regra e recusa gerar novas ocorrencias', async () => {
    const user = await bootstrapUser(app);
    const rule = await createRecurrence(app, user.accessToken, user.spaceId, {
      frequency: 'monthly',
      startDate: '2026-01-10',
      generateUpTo: '2026-02-28',
      template: { type: 'expense', description: 'Streaming', amount: '29.90' },
    });

    const arquivada = await api(app)
      .patch(`${recurrenceUrl(user.spaceId)}/${rule.body.id}`)
      .set(auth(user.accessToken))
      .send({ state: 'archived', version: 0 });
    expect(arquivada.status).toBe(200);
    expect(arquivada.body.state).toBe('archived');

    const recusada = await generateRecurrence(app, user.accessToken, user.spaceId, rule.body.id, {
      upTo: '2026-12-31',
    });
    expect(recusada.status).toBe(400);
    expect(recusada.body.code).toBe('RECURRENCE_ARCHIVED');
  });

  it('valida frequencia e intervalo da recorrencia', async () => {
    const user = await bootstrapUser(app);

    const frequenciaInvalida = await createRecurrence(app, user.accessToken, user.spaceId, {
      frequency: 'hourly',
      startDate: '2026-01-10',
      template: { type: 'expense', description: 'Invalida', amount: '10.00' },
    });
    expect(frequenciaInvalida.status).toBe(400);

    const intervaloZero = await createRecurrence(app, user.accessToken, user.spaceId, {
      frequency: 'monthly',
      interval: 0,
      startDate: '2026-01-10',
      template: { type: 'expense', description: 'Invalida', amount: '10.00' },
    });
    expect(intervaloZero.status).toBe(400);

    const regraInexistente = await generateRecurrence(
      app,
      user.accessToken,
      user.spaceId,
      '00000000-0000-0000-0000-000000000000',
    );
    expect(regraInexistente.status).toBe(404);
  });

  it('cria obrigacao avulsa, detalha e filtra por vencimento e situacao derivada', async () => {
    const user = await bootstrapUser(app);

    const created = await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'IPTU 2020',
      amount: '450.00',
      dueDate: '2020-03-20',
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('pending');
    // Vencimento no passado e ainda em aberto: `overdue` derivado na leitura.
    expect(created.body.overdue).toBe(true);

    const detalhe = await api(app)
      .get(`${obligationUrl(user.spaceId)}/${created.body.id}`)
      .set(auth(user.accessToken));
    expect(detalhe.status).toBe(200);
    expect(detalhe.body.id).toBe(created.body.id);

    const naJanela = await listObligations(app, user.accessToken, user.spaceId, '?from=2020-03-01&to=2020-03-31');
    expect(naJanela.body).toHaveLength(1);

    const foraDaJanela = await listObligations(app, user.accessToken, user.spaceId, '?from=2020-04-01');
    expect(foraDaJanela.body).toHaveLength(0);

    const vencidas = await listObligations(app, user.accessToken, user.spaceId, '?overdue=true');
    expect(vencidas.body).toHaveLength(1);

    const emDia = await listObligations(app, user.accessToken, user.spaceId, '?overdue=false');
    expect(emDia.body).toHaveLength(0);
  });

  it('atualiza a obrigacao com concorrencia otimista', async () => {
    const user = await bootstrapUser(app);
    const created = await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Condominio',
      amount: '600.00',
      dueDate: '2099-01-10',
    });
    const url = `${obligationUrl(user.spaceId)}/${created.body.id}`;

    const editada = await api(app)
      .patch(url)
      .set(auth(user.accessToken))
      .send({ description: 'Condominio revisado', amount: '650.00', status: 'ignored', version: 0 });
    expect(editada.status).toBe(200);
    expect(editada.body.description).toBe('Condominio revisado');
    expect(editada.body.amount).toBe('650');
    expect(editada.body.status).toBe('ignored');
    expect(editada.body.version).toBe(1);
    // Vencimento no futuro: nao esta vencida.
    expect(editada.body.overdue).toBe(false);

    const desatualizada = await api(app).patch(url).set(auth(user.accessToken)).send({ amount: '1.00', version: 0 });
    expect(desatualizada.status).toBe(409);
    expect(desatualizada.body.code).toBe('STALE_VERSION');

    const inexistente = await api(app)
      .get(`${obligationUrl(user.spaceId)}/00000000-0000-0000-0000-000000000000`)
      .set(auth(user.accessToken));
    expect(inexistente.status).toBe(404);
  });

  it('concilia a obrigacao com uma transacao confirmada que cobre o valor', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId, { name: 'Corrente' });
    const obligation = await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Conta de luz',
      amount: '200.00',
      dueDate: '2026-01-10',
    });

    const trx = await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Pagamento luz',
      totalAmount: '200.00',
      effectiveDate: '2026-01-09',
      postings: [{ accountId: conta.id, amount: '200.00', direction: 'credit' }],
    });
    expect(trx.status).toBe(201);

    const conciliada = await api(app)
      .post(`${obligationUrl(user.spaceId)}/${obligation.body.id}/reconcile`)
      .set(auth(user.accessToken))
      .send({ transactionId: trx.body.id });
    expect(conciliada.status).toBe(201);
    expect(conciliada.body.status).toBe('reconciled');
    expect(conciliada.body.transactionId).toBe(trx.body.id);
    expect(conciliada.body.overdue).toBe(false);
  });

  it('marca como parcialmente conciliada quando a transacao cobre so uma parte', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId, { name: 'Corrente' });
    const obligation = await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Material',
      amount: '300.00',
      dueDate: '2026-01-10',
    });

    const trx = await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Entrada material',
      totalAmount: '100.00',
      effectiveDate: '2026-01-08',
      postings: [{ accountId: conta.id, amount: '100.00', direction: 'credit' }],
    });

    const parcial = await api(app)
      .post(`${obligationUrl(user.spaceId)}/${obligation.body.id}/reconcile`)
      .set(auth(user.accessToken))
      .send({ transactionId: trx.body.id });
    expect(parcial.status).toBe(201);
    expect(parcial.body.status).toBe('partially_reconciled');
    // Obrigacao conciliada nao pode ser editada manualmente.
    const edicao = await api(app)
      .patch(`${obligationUrl(user.spaceId)}/${obligation.body.id}`)
      .set(auth(user.accessToken))
      .send({ amount: '10.00' });
    expect(edicao.status).toBe(400);
    expect(edicao.body.code).toBe('OBLIGATION_RECONCILED');
  });

  it('recusa conciliar duas vezes e reaproveitar a transacao em outra obrigacao', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId, { name: 'Corrente' });
    const primeira = await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Aluguel',
      amount: '1000.00',
      dueDate: '2026-01-05',
    });
    const segunda = await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Segunda',
      amount: '1000.00',
      dueDate: '2026-01-06',
    });

    const trx = await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Pagamento aluguel',
      totalAmount: '1000.00',
      effectiveDate: '2026-01-05',
      postings: [{ accountId: conta.id, amount: '1000.00', direction: 'credit' }],
    });

    const ok = await api(app)
      .post(`${obligationUrl(user.spaceId)}/${primeira.body.id}/reconcile`)
      .set(auth(user.accessToken))
      .send({ transactionId: trx.body.id });
    expect(ok.status).toBe(201);

    const denovo = await api(app)
      .post(`${obligationUrl(user.spaceId)}/${primeira.body.id}/reconcile`)
      .set(auth(user.accessToken))
      .send({ transactionId: trx.body.id });
    expect(denovo.status).toBe(400);
    expect(denovo.body.code).toBe('ALREADY_RECONCILED');

    const reuso = await api(app)
      .post(`${obligationUrl(user.spaceId)}/${segunda.body.id}/reconcile`)
      .set(auth(user.accessToken))
      .send({ transactionId: trx.body.id });
    expect(reuso.status).toBe(400);
    expect(reuso.body.code).toBe('TRANSACTION_ALREADY_RECONCILED');
  });

  it('recusa conciliar com transacao pendente ou inexistente', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId, { name: 'Corrente' });
    const obligation = await createObligation(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Agua',
      amount: '80.00',
      dueDate: '2026-01-10',
    });
    const base = `${obligationUrl(user.spaceId)}/${obligation.body.id}/reconcile`;

    const agendada = await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      status: 'scheduled',
      description: 'Agendada',
      totalAmount: '80.00',
      effectiveDate: '2026-02-01',
      postings: [{ accountId: conta.id, amount: '80.00', direction: 'credit' }],
    });
    const naoConfirmada = await api(app)
      .post(base)
      .set(auth(user.accessToken))
      .send({ transactionId: agendada.body.id });
    expect(naoConfirmada.status).toBe(400);
    expect(naoConfirmada.body.code).toBe('TRANSACTION_NOT_CONFIRMED');

    const inexistente = await api(app)
      .post(base)
      .set(auth(user.accessToken))
      .send({ transactionId: '00000000-0000-0000-0000-000000000000' });
    expect(inexistente.status).toBe(404);
  });

  it('isola as obrigacoes entre espacos financeiros', async () => {
    const alice = await bootstrapUser(app);
    const bob = await bootstrapUser(app);

    const obligation = await createObligation(app, alice.accessToken, alice.spaceId, {
      type: 'expense',
      description: 'Privada da Alice',
      amount: '10.00',
      dueDate: '2026-01-10',
    });

    const daAlice = await listObligations(app, alice.accessToken, alice.spaceId);
    expect(daAlice.body).toHaveLength(1);

    const daBob = await listObligations(app, bob.accessToken, bob.spaceId);
    expect(daBob.body).toHaveLength(0);

    const acessoIndevido = await api(app)
      .get(`${obligationUrl(alice.spaceId)}/${obligation.body.id}`)
      .set(auth(bob.accessToken));
    expect(acessoIndevido.status).toBe(403);
  });
});
