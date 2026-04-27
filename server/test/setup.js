/**
 * server/test/setup.js
 * --------------------
 * Shared setup for all server unit tests.
 * Mocks @prisma/client so tests never touch the real database.
 */

import { vi } from 'vitest';

// ─── Prisma mock factory ──────────────────────────────────────────────────────
// Each test file that imports a service will get this mock automatically
// because vitest.config.js lists this file in setupFiles.

// Prisma mock — defined outside vi.mock so _mock is accessible
const prismaMock = {
  questionCalibration: { findMany: vi.fn() },
  xpRule:              { findMany: vi.fn() },
  levelThreshold:      { findMany: vi.fn() },
  badge:               { findMany: vi.fn() },
  userBadge:           {
    findMany: vi.fn(),
    create:   vi.fn(),
    upsert:   vi.fn(),
  },
  userXp: {
    findUnique:  vi.fn(),
    upsert:      vi.fn(),
    update:      vi.fn(),
    updateMany:  vi.fn(),
  },
  userStreak: {
    findUnique: vi.fn(),
    upsert:     vi.fn(),
    update:     vi.fn(),
  },
  userProgress: {
    findUnique:  vi.fn(),
    findMany:    vi.fn(),
    upsert:      vi.fn(),
    aggregate:   vi.fn(),
  },
  rankingSnapshot: {
    createMany: vi.fn(),
  },
  user: {
    findUnique:  vi.fn(),
    findMany:    vi.fn(),
    count:       vi.fn(),
    updateMany:  vi.fn(),
    update:      vi.fn(),
  },
};

vi.mock('@prisma/client', () => {
  // Use function keyword so it works as a constructor (new PrismaClient())
  function PrismaClient() {
    return prismaMock;
  }
  return {
    PrismaClient,
    _mock: prismaMock,
  };
});

// ─── Seed-level data used by multiple tests ───────────────────────────────────

export const CALIBRATIONS = {
  EASY:   { difficulty: 'EASY',   a: 1.0, b: -1.5, c: 0.20 },
  MEDIUM: { difficulty: 'MEDIUM', a: 1.2, b:  0.0, c: 0.25 },
  HARD:   { difficulty: 'HARD',   a: 1.4, b:  1.5, c: 0.25 },
};

export const XP_RULES = {
  ANSWER_ANY:      2,
  CORRECT_EASY:    3,
  CORRECT_MEDIUM:  5,
  CORRECT_HARD:    8,
  WRONG:           0,
  FINISH_MOCK_FULL: 200,
  SUBMIT_ESSAY:    50,
};

export const LEVEL_THRESHOLDS = Array.from({ length: 50 }, (_, i) => {
  const n = i + 1;
  let xp;
  if (n <= 20) {
    xp = Math.round(50 * (n - 1) + 10 * (n - 1) ** 2);
  } else {
    const base = Math.round(50 * 19 + 10 * 19 ** 2); // level 20 threshold
    xp = Math.round(base * Math.pow(1.2, n - 20));
  }
  return { level: n, xpRequired: xp, title: `Nível ${n}` };
});

export const BADGES = [
  { key: 'progress.first_question', title: 'Primeira Questão', description: '', category: 'PROGRESS', criteria: '{}', iconEmoji: '🎯' },
  { key: 'progress.streak_10',      title: 'Sequência Dupla',  description: '', category: 'PROGRESS', criteria: '{}', iconEmoji: '🔥' },
  { key: 'subject.matematica.bronze', title: 'Bronze Matemática', description: '', category: 'SUBJECT', criteria: JSON.stringify({ subject: 'Matemática', count: 10 }), iconEmoji: '🥉' },
  { key: 'habit.streak_7',           title: '7 Dias',           description: '', category: 'HABIT',   criteria: JSON.stringify({ days: 7 }), iconEmoji: '📅' },
  { key: 'mock.first',               title: 'Primeiro Simulado', description: '', category: 'MOCK', criteria: '{}', iconEmoji: '📋' },
  { key: 'essay.first',              title: 'Primeira Redação',  description: '', category: 'ESSAY', criteria: '{}', iconEmoji: '✍️' },
];
