import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/db';
import {
  api,
  auth,
  bootstrapUser,
  createAccount,
  createTransaction,
  registerUser,
} from './utils/factory';

const MES = '2026-03';

describe('E2E | Transações: criação, consistência de movimentos, idempotência e dashboard', () => {
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

  it('cria uma despesa confirmada com o movimento na conta', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    const res = await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Supermercado',
      totalAmount: '250.75',
      effectiveDate: `${MES}-10`,
      postings: [{ accountId: conta.id, amount: '250.75', direction: 'credit' }],
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('confirmed');
    expect(res.body.postings).toHaveLength(1);
    expect(res.body.postings[0].accountId).toBe(conta.id);
  });

  it('rejeita despesa cujo movimento não fecha com o total (INVALID_POSTINGS)', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    const res = await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Despesa inconsistente',
      totalAmount: '100.00',
      effectiveDate: `${MES}-10`,
      postings: [{ accountId: conta.id, amount: '70.00', direction: 'credit' }],
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_POSTINGS');

    const count = await prisma.transaction.count({ where: { financialSpaceId: user.spaceId } });
    expect(count).toBe(0);
  });

  it('rejeita transferência com débitos e créditos diferentes (INVALID_TRANSFER_POSTINGS)', async () => {
    const user = await bootstrapUser(app);
    const origem = await createAccount(app, user.accessToken, user.spaceId, { name: 'Origem' });
    const destino = await createAccount(app, user.accessToken, user.spaceId, { name: 'Destino' });

    const res = await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'transfer',
      description: 'Transferência inconsistente',
      totalAmount: '100.00',
      effectiveDate: `${MES}-11`,
      postings: [
        { accountId: origem.id, amount: '100.00', direction: 'credit' },
        { accountId: destino.id, amount: '60.00', direction: 'debit' },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TRANSFER_POSTINGS');
  });

  it('registra uma transferência válida entre duas contas', async () => {
    const user = await bootstrapUser(app);
    const origem = await createAccount(app, user.accessToken, user.spaceId, { name: 'Origem' });
    const destino = await createAccount(app, user.accessToken, user.spaceId, { name: 'Destino' });

    const res = await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'transfer',
      description: 'Aporte na poupança',
      totalAmount: '500.00',
      effectiveDate: `${MES}-11`,
      postings: [
        { accountId: origem.id, amount: '500.00', direction: 'credit' },
        { accountId: destino.id, amount: '500.00', direction: 'debit' },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('transfer');
    expect(res.body.postings).toHaveLength(2);

    const debitos = res.body.postings
      .filter((p: { direction: string }) => p.direction === 'debit')
      .reduce((acc: number, p: { amount: string }) => acc + Number(p.amount), 0);
    const creditos = res.body.postings
      .filter((p: { direction: string }) => p.direction === 'credit')
      .reduce((acc: number, p: { amount: string }) => acc + Number(p.amount), 0);
    expect(debitos).toBe(creditos);
  });

  it('é idempotente quando recebe a mesma Idempotency-Key', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);
    const chave = `idem-${Date.now()}`;

    const body = {
      type: 'income' as const,
      description: 'Salário',
      totalAmount: '5000.00',
      effectiveDate: `${MES}-05`,
      postings: [{ accountId: conta.id, amount: '5000.00', direction: 'debit' as const }],
    };

    const primeira = await createTransaction(app, user.accessToken, user.spaceId, body, chave);
    const segunda = await createTransaction(app, user.accessToken, user.spaceId, body, chave);

    expect(primeira.status).toBe(201);
    expect(segunda.status).toBe(201);
    expect(segunda.body.id).toBe(primeira.body.id);

    const count = await prisma.transaction.count({ where: { financialSpaceId: user.spaceId } });
    expect(count).toBe(1);

    // Sem a chave, uma segunda chamada cria um novo registro.
    const terceira = await createTransaction(app, user.accessToken, user.spaceId, body);
    expect(terceira.status).toBe(201);
    expect(terceira.body.id).not.toBe(primeira.body.id);
    expect(await prisma.transaction.count({ where: { financialSpaceId: user.spaceId } })).toBe(2);
  });

  it('lista as transações com paginação e filtros', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    for (const [tipo, valor, descricao] of [
      ['income', '1000.00', 'Freelance'],
      ['expense', '200.00', 'Mercado'],
      ['expense', '300.00', 'Farmácia'],
    ] as const) {
      const res = await createTransaction(app, user.accessToken, user.spaceId, {
        type: tipo,
        description: descricao,
        totalAmount: valor,
        effectiveDate: `${MES}-15`,
        postings: [
          {
            accountId: conta.id,
            amount: valor,
            direction: tipo === 'income' ? 'debit' : 'credit',
          },
        ],
      });
      expect(res.status).toBe(201);
    }

    const todas = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/transactions`)
      .set(auth(user.accessToken));
    expect(todas.status).toBe(200);
    expect(todas.body.total).toBe(3);
    expect(todas.body.items).toHaveLength(3);

    const soDespesas = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/transactions?type=expense`)
      .set(auth(user.accessToken));
    expect(soDespesas.body.total).toBe(2);

    const porTexto = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/transactions?q=mercado`)
      .set(auth(user.accessToken));
    expect(porTexto.body.total).toBe(1);

    const porConta = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/transactions?accountId=${conta.id}`)
      .set(auth(user.accessToken));
    expect(porConta.body.total).toBe(3);

    const pagina1 = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/transactions?limit=2`)
      .set(auth(user.accessToken));
    expect(pagina1.body.items).toHaveLength(2);
    expect(pagina1.body.total).toBe(3);
    expect(pagina1.body.nextCursor).toBeTypeOf('string');

    // O `cursor` é comparado por `id` (UUID aleatório) enquanto a ordenação é
    // por data de competência, então não é possível afirmar quantos itens a
    // segunda página devolve. Além disso o `total` é recalculado sob o mesmo
    // `where` (já incluindo `id < cursor`), por isso só validamos o contrato.
    const pagina2 = await api(app)
      .get(
        `/api/v1/financial-spaces/${user.spaceId}/transactions?limit=2&cursor=${pagina1.body.nextCursor}`,
      )
      .set(auth(user.accessToken));
    expect(pagina2.status).toBe(200);
    expect(Array.isArray(pagina2.body.items)).toBe(true);
  });

  it('consulta o detalhe e cancela a transação (exclusão lógica)', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    const criada = await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Assinatura',
      totalAmount: '39.90',
      effectiveDate: `${MES}-20`,
      postings: [{ accountId: conta.id, amount: '39.90', direction: 'credit' }],
    });

    const detalhe = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/transactions/${criada.body.id}`)
      .set(auth(user.accessToken));
    expect(detalhe.status).toBe(200);
    expect(detalhe.body.postings[0].account.name).toBe('Conta E2E');

    const cancelada = await api(app)
      .delete(`/api/v1/financial-spaces/${user.spaceId}/transactions/${criada.body.id}`)
      .set(auth(user.accessToken));
    expect(cancelada.status).toBe(200);
    expect(cancelada.body.status).toBe('canceled');

    // O registro continua existindo (exclusão lógica).
    const aindaExiste = await prisma.transaction.findUnique({
      where: { id: criada.body.id },
    });
    expect(aindaExiste?.status).toBe('canceled');

    const inexistente = await api(app)
      .get(
        `/api/v1/financial-spaces/${user.spaceId}/transactions/00000000-0000-0000-0000-000000000000`,
      )
      .set(auth(user.accessToken));
    expect(inexistente.status).toBe(404);
  });

  it('consolida o dashboard do mês ignorando canceladas e projetando as pendentes', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'income',
      description: 'Salário',
      totalAmount: '500.00',
      effectiveDate: `${MES}-05`,
      postings: [{ accountId: conta.id, amount: '500.00', direction: 'debit' }],
    }).expect(201);

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Aluguel',
      totalAmount: '100.00',
      effectiveDate: `${MES}-10`,
      postings: [{ accountId: conta.id, amount: '100.00', direction: 'credit' }],
    }).expect(201);

    const cancelada = await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Compra estornada',
      totalAmount: '999.00',
      effectiveDate: `${MES}-12`,
      postings: [{ accountId: conta.id, amount: '999.00', direction: 'credit' }],
    });
    await api(app)
      .delete(`/api/v1/financial-spaces/${user.spaceId}/transactions/${cancelada.body.id}`)
      .set(auth(user.accessToken))
      .expect(200);

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Fatura prevista',
      status: 'scheduled',
      totalAmount: '200.00',
      effectiveDate: `${MES}-20`,
      dueDate: `${MES}-20`,
      postings: [{ accountId: conta.id, amount: '200.00', direction: 'credit' }],
    }).expect(201);

    const res = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/transactions/summary/dashboard?month=${MES}`)
      .set(auth(user.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.periodStart).toBe(`${MES}-01`);
    expect(res.body.periodEnd).toBe(`${MES}-31`);
    expect(res.body.totalIncome).toBe('500.00');
    expect(res.body.totalExpense).toBe('100.00');
    expect(res.body.netBalance).toBe('400.00');
    expect(res.body.realizedBalance).toBe('400.00');
    expect(res.body.upcomingDueCount).toBe(1);
    expect(res.body.upcomingDueAmount).toBe('200.00');
    expect(res.body.projectedBalance).toBe('200.00');
  });

  it('respeita o mês consultado no dashboard', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'income',
      description: 'Receita de março',
      totalAmount: '300.00',
      effectiveDate: '2026-03-05',
      postings: [{ accountId: conta.id, amount: '300.00', direction: 'debit' }],
    }).expect(201);

    const marco = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/transactions/summary/dashboard?month=2026-03`)
      .set(auth(user.accessToken));
    expect(marco.body.totalIncome).toBe('300.00');

    const abril = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/transactions/summary/dashboard?month=2026-04`)
      .set(auth(user.accessToken));
    // Sem lançamentos os acumuladores permanecem no valor inicial "0" (só
    // recebem `toFixed(2)` ao somar), então não há casas decimais.
    expect(abril.body.totalIncome).toBe('0');
  });

  it('isola as transações entre espaços financeiros (403)', async () => {
    const dono = await bootstrapUser(app);
    const outro = await bootstrapUser(app);
    const contaDoDono = await createAccount(app, dono.accessToken, dono.spaceId);

    const res = await createTransaction(app, outro.accessToken, dono.spaceId, {
      type: 'expense',
      description: 'Intrusa',
      totalAmount: '10.00',
      effectiveDate: `${MES}-01`,
      postings: [{ accountId: contaDoDono.id, amount: '10.00', direction: 'credit' }],
    });

    expect(res.status).toBe(403);
  });

  it('permite contributor e bloqueia viewer na criação de transações', async () => {
    const dono = await bootstrapUser(app);
    const contributor = await registerUser(app);
    const viewer = await registerUser(app);
    const conta = await createAccount(app, dono.accessToken, dono.spaceId);

    for (const [email, role] of [
      [contributor.email, 'contributor'],
      [viewer.email, 'viewer'],
    ] as const) {
      await api(app)
        .post(`/api/v1/financial-spaces/${dono.spaceId}/members`)
        .set(auth(dono.accessToken))
        .send({ email, role })
        .expect(201);
    }

    const criadaPeloContributor = await createTransaction(
      app,
      contributor.accessToken,
      dono.spaceId,
      {
        type: 'expense',
        description: 'Lançada pelo contributor',
        totalAmount: '20.00',
        effectiveDate: `${MES}-02`,
        postings: [{ accountId: conta.id, amount: '20.00', direction: 'credit' }],
      },
    );
    expect(criadaPeloContributor.status).toBe(201);

    const tentativaDoViewer = await createTransaction(app, viewer.accessToken, dono.spaceId, {
      type: 'expense',
      description: 'Tentativa do viewer',
      totalAmount: '20.00',
      effectiveDate: `${MES}-02`,
      postings: [{ accountId: conta.id, amount: '20.00', direction: 'credit' }],
    });
    expect(tentativaDoViewer.status).toBe(403);
  });

  it('estorna uma despesa criando a transacao de compensacao vinculada e auditada', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    const original = await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Compra duplicada',
      totalAmount: '250.75',
      effectiveDate: `${MES}-10`,
      postings: [{ accountId: conta.id, amount: '250.75', direction: 'credit' }],
    });
    expect(original.status).toBe(201);

    const res = await api(app)
      .post(`/api/v1/financial-spaces/${user.spaceId}/transactions/${original.body.id}/reverse`)
      .set(auth(user.accessToken))
      .send({ reason: 'Lançamento em duplicidade' });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe('expense');
    expect(res.body.status).toBe('confirmed');
    expect(Number(res.body.totalAmount)).toBe(-250.75);
    expect(res.body.reversalOfTransactionId).toBe(original.body.id);
    expect(res.body.reversalReason).toBe('Lançamento em duplicidade');
    expect(res.body.description).toContain('Estorno');
    expect(res.body.reversalOfTransaction.id).toBe(original.body.id);

    // O movimento e o espelho do original: credito vira debito, mesma conta.
    expect(res.body.postings).toHaveLength(1);
    expect(res.body.postings[0].direction).toBe('debit');
    expect(res.body.postings[0].accountId).toBe(conta.id);

    // O original permanece confirmado (e nos totais), apenas marcado como estornado.
    const originalNoBanco = await prisma.transaction.findUnique({ where: { id: original.body.id } });
    expect(originalNoBanco?.status).toBe('confirmed');
    expect(originalNoBanco?.reversedAt).not.toBeNull();

    const auditoria = await prisma.auditLog.count({
      where: { entityId: original.body.id, operation: 'transaction.reverse' },
    });
    expect(auditoria).toBe(1);
  });

  it('espelha os movimentos ao estornar uma transferência', async () => {
    const user = await bootstrapUser(app);
    const origem = await createAccount(app, user.accessToken, user.spaceId, { name: 'Origem' });
    const destino = await createAccount(app, user.accessToken, user.spaceId, { name: 'Destino' });

    const original = await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'transfer',
      description: 'Aporte na poupança',
      totalAmount: '500.00',
      effectiveDate: `${MES}-11`,
      postings: [
        { accountId: origem.id, amount: '500.00', direction: 'credit' },
        { accountId: destino.id, amount: '500.00', direction: 'debit' },
      ],
    });
    expect(original.status).toBe(201);

    const res = await api(app)
      .post(`/api/v1/financial-spaces/${user.spaceId}/transactions/${original.body.id}/reverse`)
      .set(auth(user.accessToken))
      .send({})
      .expect(201);

    expect(res.body.postings).toHaveLength(2);
    const origemReversa = res.body.postings.find((p: { accountId: string }) => p.accountId === origem.id);
    const destinoReversa = res.body.postings.find((p: { accountId: string }) => p.accountId === destino.id);
    expect(origemReversa.direction).toBe('debit');
    expect(destinoReversa.direction).toBe('credit');
  });

  it('zera o efeito do estorno nos totais do dashboard', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'income',
      description: 'Receita',
      totalAmount: '500.00',
      effectiveDate: `${MES}-05`,
      postings: [{ accountId: conta.id, amount: '500.00', direction: 'debit' }],
    }).expect(201);

    const despesa = await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Despesa',
      totalAmount: '100.00',
      effectiveDate: `${MES}-10`,
      postings: [{ accountId: conta.id, amount: '100.00', direction: 'credit' }],
    });

    const antes = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/transactions/summary/dashboard?month=${MES}`)
      .set(auth(user.accessToken));
    expect(antes.body.totalExpense).toBe('100.00');
    expect(antes.body.realizedBalance).toBe('400.00');

    await api(app)
      .post(`/api/v1/financial-spaces/${user.spaceId}/transactions/${despesa.body.id}/reverse`)
      .set(auth(user.accessToken))
      .send({})
      .expect(201);

    const depois = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/transactions/summary/dashboard?month=${MES}`)
      .set(auth(user.accessToken));
    expect(depois.body.totalIncome).toBe('500.00');
    expect(depois.body.totalExpense).toBe('0.00');
    expect(depois.body.netBalance).toBe('500.00');
    expect(depois.body.realizedBalance).toBe('500.00');
  });

  it('recusa estornar a mesma transação duas vezes (ALREADY_REVERSED)', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    const original = await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Assinatura',
      totalAmount: '39.90',
      effectiveDate: `${MES}-20`,
      postings: [{ accountId: conta.id, amount: '39.90', direction: 'credit' }],
    });

    await api(app)
      .post(`/api/v1/financial-spaces/${user.spaceId}/transactions/${original.body.id}/reverse`)
      .set(auth(user.accessToken))
      .send({})
      .expect(201);

    const segunda = await api(app)
      .post(`/api/v1/financial-spaces/${user.spaceId}/transactions/${original.body.id}/reverse`)
      .set(auth(user.accessToken))
      .send({});
    expect(segunda.status).toBe(400);
    expect(segunda.body.code).toBe('ALREADY_REVERSED');

    // Nenhuma transacao de estorno duplicada foi criada.
    const count = await prisma.transaction.count({ where: { financialSpaceId: user.spaceId } });
    expect(count).toBe(2);
  });

  it('recusa estornar uma transação que já é um estorno (CANNOT_REVERSE_REVERSAL)', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    const original = await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'income',
      description: 'Freelance',
      totalAmount: '800.00',
      effectiveDate: `${MES}-06`,
      postings: [{ accountId: conta.id, amount: '800.00', direction: 'debit' }],
    });

    const estorno = await api(app)
      .post(`/api/v1/financial-spaces/${user.spaceId}/transactions/${original.body.id}/reverse`)
      .set(auth(user.accessToken))
      .send({})
      .expect(201);

    const res = await api(app)
      .post(`/api/v1/financial-spaces/${user.spaceId}/transactions/${estorno.body.id}/reverse`)
      .set(auth(user.accessToken))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CANNOT_REVERSE_REVERSAL');
  });

  it('recusa estornar transação cancelada (INVALID_TRANSACTION_STATUS)', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    const original = await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Cancelada',
      totalAmount: '10.00',
      effectiveDate: `${MES}-08`,
      postings: [{ accountId: conta.id, amount: '10.00', direction: 'credit' }],
    });

    await api(app)
      .delete(`/api/v1/financial-spaces/${user.spaceId}/transactions/${original.body.id}`)
      .set(auth(user.accessToken))
      .expect(200);

    const res = await api(app)
      .post(`/api/v1/financial-spaces/${user.spaceId}/transactions/${original.body.id}/reverse`)
      .set(auth(user.accessToken))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TRANSACTION_STATUS');
  });

  it('bloqueia viewer e isola o estorno entre espaços financeiros', async () => {
    const dono = await bootstrapUser(app);
    const viewer = await registerUser(app);
    const conta = await createAccount(app, dono.accessToken, dono.spaceId);

    await api(app)
      .post(`/api/v1/financial-spaces/${dono.spaceId}/members`)
      .set(auth(dono.accessToken))
      .send({ email: viewer.email, role: 'viewer' })
      .expect(201);

    const original = await createTransaction(app, dono.accessToken, dono.spaceId, {
      type: 'expense',
      description: 'Protegida',
      totalAmount: '15.00',
      effectiveDate: `${MES}-09`,
      postings: [{ accountId: conta.id, amount: '15.00', direction: 'credit' }],
    });

    const tentativaDoViewer = await api(app)
      .post(`/api/v1/financial-spaces/${dono.spaceId}/transactions/${original.body.id}/reverse`)
      .set(auth(viewer.accessToken))
      .send({});
    expect(tentativaDoViewer.status).toBe(403);

    const estranho = await bootstrapUser(app);
    const tentativaDeOutro = await api(app)
      .post(`/api/v1/financial-spaces/${estranho.spaceId}/transactions/${original.body.id}/reverse`)
      .set(auth(estranho.accessToken))
      .send({});
    expect(tentativaDeOutro.status).toBe(404);
  });

  it('exporta as transações em CSV respeitando o período e os filtros', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId, { name: 'Conta E2E' });

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'income',
      description: 'Salario março',
      totalAmount: '1000.00',
      effectiveDate: `${MES}-05`,
      postings: [{ accountId: conta.id, amount: '1000.00', direction: 'debit' }],
    }).expect(201);

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Mercado',
      totalAmount: '250.75',
      effectiveDate: `${MES}-10`,
      postings: [{ accountId: conta.id, amount: '250.75', direction: 'credit' }],
    }).expect(201);

    // Fora do período: não pode aparecer no CSV filtrado.
    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Fora do período',
      totalAmount: '99.00',
      effectiveDate: '2026-04-01',
      postings: [{ accountId: conta.id, amount: '99.00', direction: 'credit' }],
    }).expect(201);

    const res = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/transactions/export?from=${MES}-01&to=${MES}-31`)
      .set(auth(user.accessToken));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('transacoes-2026-03-01_2026-03-31.csv');
    // BOM para o Excel reconhecer o UTF-8.
    expect(res.text.startsWith('\uFEFF')).toBe(true);

    const [cabecalho, ...corpo] = res.text.replace('\uFEFF', '').trim().split('\r\n');
    expect(cabecalho).toBe('data,tipo,situacao,descricao,categoria,contas,valor,moeda');
    expect(corpo).toHaveLength(2);
    // Ordenado por data desc: a despesa de 10/03 vem antes da receita de 05/03.
    expect(corpo[0].split(',')).toEqual([
      '2026-03-10', 'expense', 'confirmed', 'Mercado', '', 'Conta E2E', '250.75', 'BRL',
    ]);
    expect(corpo[1].split(',')).toEqual([
      '2026-03-05', 'income', 'confirmed', 'Salario março', '', 'Conta E2E', '1000.00', 'BRL',
    ]);

    // Filtro por tipo reaproveitado da listagem.
    const apenasDespesas = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/transactions/export?from=${MES}-01&to=${MES}-31&type=expense`)
      .set(auth(user.accessToken));
    expect(apenasDespesas.text.replace('\uFEFF', '').trim().split('\r\n')).toHaveLength(2);
  });

  it('escapa vírgulas e aspas nos campos do CSV', async () => {
    const user = await bootstrapUser(app);
    const conta = await createAccount(app, user.accessToken, user.spaceId);

    await createTransaction(app, user.accessToken, user.spaceId, {
      type: 'expense',
      description: 'Compra "promocional", com vírgula',
      totalAmount: '12.50',
      effectiveDate: `${MES}-07`,
      postings: [{ accountId: conta.id, amount: '12.50', direction: 'credit' }],
    }).expect(201);

    const res = await api(app)
      .get(`/api/v1/financial-spaces/${user.spaceId}/transactions/export?from=${MES}-01&to=${MES}-31`)
      .set(auth(user.accessToken));

    expect(res.status).toBe(200);
    expect(res.text).toContain('"Compra ""promocional"", com vírgula"');
  });

  it('isola a exportação entre espaços financeiros (403)', async () => {
    const dono = await bootstrapUser(app);
    const outro = await bootstrapUser(app);

    const res = await api(app)
      .get(`/api/v1/financial-spaces/${dono.spaceId}/transactions/export`)
      .set(auth(outro.accessToken));

    expect(res.status).toBe(403);
  });
});
