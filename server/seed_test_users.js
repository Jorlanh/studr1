import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = 'Studr@2026';

const TEST_USERS = [
  {
    email: 'trial@studr.com.br',
    name: 'Teste Trial',
    isPremium: false,
    subscriptionStatus: null,
    trialEndsAt: new Date('2099-12-31'), // trial ativo "eterno"
  },
  {
    email: 'premium@studr.com.br',
    name: 'Teste Premium',
    isPremium: true,
    subscriptionStatus: 'ACTIVE',
    trialEndsAt: new Date('2099-12-31'),
  },
  {
    email: 'simulado@studr.com.br',
    name: 'Teste Simulado',
    isPremium: false,
    subscriptionStatus: 'MOCK_ONLY',
    trialEndsAt: new Date('2000-01-01'), // trial expirado — acesso só via MOCK_ONLY
  },
];

async function seed() {
  const hashedPassword = await bcrypt.hash(PASSWORD, 10);

  for (const u of TEST_USERS) {
    try {
      await prisma.user.upsert({
        where: { email: u.email },
        update: {
          name: u.name,
          password: hashedPassword,
          isPremium: u.isPremium,
          subscriptionStatus: u.subscriptionStatus,
          trialEndsAt: u.trialEndsAt,
          isVerified: true,
          role: 'student',
        },
        create: {
          email: u.email,
          name: u.name,
          password: hashedPassword,
          isPremium: u.isPremium,
          subscriptionStatus: u.subscriptionStatus,
          trialEndsAt: u.trialEndsAt,
          isVerified: true,
          role: 'student',
        },
      });
      console.log(`✓ ${u.email} criado/atualizado (${u.subscriptionStatus || 'TRIAL'})`);
    } catch (error) {
      console.error(`✗ Erro em ${u.email}:`, error.message);
    }
  }

  await prisma.$disconnect();
  console.log('\nPronto! Senha de todos: ' + PASSWORD);
}

seed();
