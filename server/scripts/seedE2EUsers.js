/**
 * seedE2EUsers.js
 * ---------------
 * Cria (ou reseta) os usuários de teste para os E2E do Playwright.
 * Deve ser executado com a variável DATABASE_URL apontando para o banco de teste.
 *
 * Uso:
 *   node server/scripts/seedE2EUsers.js
 *   E2E_PASSWORD=outra_senha node server/scripts/seedE2EUsers.js
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = process.env.E2E_PASSWORD || 'E2eTest@2026';

const USERS = [
  {
    email: process.env.E2E_PREMIUM_EMAIL || 'e2e.premium@studr.test',
    name: 'E2E Premium',
    isPremium: true,
    isVerified: true,
    subscriptionStatus: 'FULL',
    // Trial não expira (premium ignora isso)
    trialEndsAt: new Date('2099-01-01'),
    // Zera quota trial para consistência
    trialQuestionsDate: null,
    trialQuestionsUsed: 0,
  },
  {
    email: process.env.E2E_TRIAL_EMAIL || 'e2e.trial@studr.test',
    name: 'E2E Trial',
    isPremium: false,
    isVerified: true,
    subscriptionStatus: null,
    // Trial válido por 30 dias a partir de agora
    trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    // Zera quota diária para garantir que o paywall test começa do zero
    trialQuestionsDate: null,
    trialQuestionsUsed: 0,
  },
];

async function main() {
  const hashedPassword = await bcrypt.hash(PASSWORD, 10);

  for (const userData of USERS) {
    const { email, ...rest } = userData;

    await prisma.user.upsert({
      where: { email },
      update: {
        ...rest,
        password: hashedPassword,
        // Limpar dados de gamificação para estado limpo a cada run
      },
      create: {
        email,
        password: hashedPassword,
        ...rest,
      },
    });

    // Zerar xpRecord, streak e progresso para estado limpo
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await Promise.all([
        prisma.userXp.upsert({
          where: { userId: user.id },
          update: { totalXp: 0, level: 1, weeklyXp: 0, weekStartsAt: new Date() },
          create: { userId: user.id, totalXp: 0, level: 1, weeklyXp: 0, weekStartsAt: new Date() },
        }),
        prisma.userStreak.upsert({
          where: { userId: user.id },
          update: { currentStreak: 0, longestStreak: 0, multiplier: 1.0, lastActiveDate: null },
          create: { userId: user.id, currentStreak: 0, longestStreak: 0, multiplier: 1.0 },
        }),
        prisma.userBadge.deleteMany({ where: { userId: user.id } }),
        prisma.userProgress.deleteMany({ where: { userId: user.id } }),
      ]);
    }

    console.log(`[e2e-seed] ✓ ${email} (${rest.isPremium ? 'premium' : 'trial'})`);
  }

  console.log('[e2e-seed] Usuários E2E prontos.');
}

main()
  .catch(err => {
    console.error('[e2e-seed] Erro:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
