/**
 * integrationSetup.js
 * -------------------
 * Global setup for integration tests.
 * Uses REAL Prisma (no mock). DATABASE_URL must point to a test DB.
 */

import { PrismaClient } from '@prisma/client';
import { afterEach, afterAll, beforeAll } from 'vitest';

export const prisma = new PrismaClient();

// Verify DB is reachable before running tests
beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

// Clean up test-created users after each test (users with @test.studr suffix)
afterEach(async () => {
  await prisma.userBadge.deleteMany({ where: { user: { email: { endsWith: '@test.studr' } } } });
  await prisma.userProgress.deleteMany({ where: { user: { email: { endsWith: '@test.studr' } } } });
  await prisma.userXp.deleteMany({ where: { user: { email: { endsWith: '@test.studr' } } } });
  await prisma.userStreak.deleteMany({ where: { user: { email: { endsWith: '@test.studr' } } } });
  await prisma.rankingSnapshot.deleteMany({ where: { user: { email: { endsWith: '@test.studr' } } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { endsWith: '@test.studr' } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});
