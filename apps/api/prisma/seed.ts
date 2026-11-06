import { PrismaClient, AccountType, CategoryType } from '@prisma/client';

const prisma = new PrismaClient();

async function seedUserAndSpace(prisma: PrismaClient) {
  const seedEmail = 'demo@scf.local';
  const user = await prisma.user.upsert({
    where: { email: seedEmail },
    create: {
      email: seedEmail,
      emailVerifiedAt: new Date(),
      name: 'Usuario Demo',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
    },
    update: {},
  });

  let space = await prisma.financialSpace.findFirst({
    where: { memberships: { some: { userId: user.id, role: 'owner' } } },
  });
  if (!space) {
    space = await prisma.financialSpace.create({
      data: {
        name: 'Financeiro Pessoal (Demo)',
        primaryCurrency: 'BRL',
        timezone: 'America/Sao_Paulo',
        memberships: { create: { userId: user.id, role: 'owner' } },
      },
    });
  }

  const spaceId = space.id;

  const catCount = await prisma.category.count({ where: { financialSpaceId: spaceId } });
  if (catCount === 0) {
    const defaults: Array<{ name: string; type: CategoryType; color?: string; icon?: string }> = [
      { name: 'Salario', type: 'income', color: '#158441', icon: 'wallet' },
      { name: 'Investimentos', type: 'income', color: '#1e57f5', icon: 'trending-up' },
      { name: 'Freelance', type: 'income', color: '#22a552', icon: 'briefcase' },
      { name: 'Moradia', type: 'expense', color: '#1e57f5', icon: 'home' },
      { name: 'Alimentacao', type: 'expense', color: '#22a552', icon: 'utensils' },
      { name: 'Transporte', type: 'expense', color: '#ff850a', icon: 'car' },
      { name: 'Saude', type: 'expense', color: '#ef4444', icon: 'heart' },
      { name: 'Educacao', type: 'expense', color: '#8b5cf6', icon: 'book' },
      { name: 'Lazer', type: 'expense', color: '#ec4899', icon: 'smile' },
      { name: 'Outros', type: 'both', color: '#64748b', icon: 'tag' },
    ];
    await prisma.category.createMany({
      data: defaults.map((c) => ({ ...c, financialSpaceId: spaceId })),
    });
  }

  const accCount = await prisma.account.count({ where: { financialSpaceId: spaceId } });
  if (accCount === 0) {
    // `initialBalanceDate` é DateTime (@db.Date): o Prisma exige um Date, não uma string ISO.
    const today = new Date();
    await prisma.account.createMany({
      data: [
        {
          financialSpaceId: spaceId,
          name: 'Conta Corrente',
          type: AccountType.checking,
          currency: 'BRL',
          initialBalance: '2500.00',
          initialBalanceDate: today,
          color: '#1e57f5',
          icon: 'bank',
        },
        {
          financialSpaceId: spaceId,
          name: 'Carteira',
          type: AccountType.cash,
          currency: 'BRL',
          initialBalance: '150.50',
          initialBalanceDate: today,
          color: '#158441',
          icon: 'wallet',
        },
        {
          financialSpaceId: spaceId,
          name: 'Poupanca',
          type: AccountType.savings,
          currency: 'BRL',
          initialBalance: '10000.00',
          initialBalanceDate: today,
          color: '#8b5cf6',
          icon: 'piggy-bank',
        },
      ],
    });
  }

  console.log(`Usuario demo: ${seedEmail}`);
  console.log(`Espaco financeiro ID: ${spaceId}`);
}

async function main() {
  try {
    await seedUserAndSpace(prisma);
    console.log('Seed concluido.');
  } catch (err) {
    console.error('Falha no seed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
