/**
 * gamificationService.test.js
 * ---------------------------
 * Unit tests for XP, streak, badge, and state logic.
 * Prisma is mocked via server/test/setup.js.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { emitEvent, checkBadges, updateSubjectProgress, getState } from './gamificationService.js';
import { XP_RULES, LEVEL_THRESHOLDS, BADGES } from '../test/setup.js';

const { _mock: db } = await import('@prisma/client');

// ─── Default mock responses ───────────────────────────────────────────────────

const defaultStreak = {
  userId: 'u1',
  currentStreak: 1,
  longestStreak: 1,
  multiplier: 1.0,
  lastActiveDate: new Date(),
};

const defaultXp = {
  userId: 'u1',
  totalXp: 0,
  level: 1,
  weeklyXp: 0,
  weekStartsAt: new Date(),
};

function makeXp(overrides = {}) {
  return { ...defaultXp, ...overrides };
}

function makeStreak(overrides = {}) {
  return { ...defaultStreak, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();

  // XP rules & level thresholds (shared across service module-level caches)
  db.xpRule.findMany.mockResolvedValue(
    Object.entries(XP_RULES).map(([eventType, xp]) => ({ eventType, xp }))
  );
  db.levelThreshold.findMany.mockResolvedValue(LEVEL_THRESHOLDS);
  db.badge.findMany.mockResolvedValue(BADGES);

  // Default streak & xp for a fresh user
  db.userStreak.upsert.mockResolvedValue(makeStreak());
  db.userStreak.findUnique.mockResolvedValue(null);
  db.userStreak.update.mockImplementation(({ data }) =>
    Promise.resolve({ ...defaultStreak, ...data })
  );

  db.userXp.upsert.mockResolvedValue(makeXp());
  db.userXp.update.mockImplementation(({ data }) =>
    Promise.resolve({ ...defaultXp, ...data })
  );

  db.userBadge.findMany.mockResolvedValue([]);
  db.userBadge.create.mockResolvedValue({});
  db.userProgress.upsert.mockResolvedValue({});
  db.userProgress.findUnique.mockResolvedValue(null);
  db.userProgress.aggregate.mockResolvedValue({ _sum: { questionsAnswered: 0 } });
});

// ─── XP calculation ───────────────────────────────────────────────────────────

describe('emitEvent — XP por tipo de questão', () => {
  it('acertar EASY concede ANSWER_ANY + CORRECT_EASY = 5 XP (sem streak)', async () => {
    db.userXp.upsert.mockResolvedValue(makeXp());

    const result = await emitEvent('u1', 'ANSWER_QUESTION', {
      subject: 'Matemática',
      difficulty: 'EASY',
      correct: true,
    });

    // delta = (ANSWER_ANY=2 + CORRECT_EASY=3) * multiplier 1.0 = 5
    expect(result.xpDelta).toBe(5);
  });

  it('acertar MEDIUM concede 2 + 5 = 7 XP', async () => {
    const result = await emitEvent('u1', 'ANSWER_QUESTION', {
      subject: 'Matemática',
      difficulty: 'MEDIUM',
      correct: true,
    });
    expect(result.xpDelta).toBe(7);
  });

  it('acertar HARD concede 2 + 8 = 10 XP', async () => {
    const result = await emitEvent('u1', 'ANSWER_QUESTION', {
      subject: 'Matemática',
      difficulty: 'HARD',
      correct: true,
    });
    expect(result.xpDelta).toBe(10);
  });

  it('errar questão concede só ANSWER_ANY = 2 XP', async () => {
    const result = await emitEvent('u1', 'ANSWER_QUESTION', {
      subject: 'Matemática',
      difficulty: 'MEDIUM',
      correct: false,
    });
    expect(result.xpDelta).toBe(2);
  });
});

describe('emitEvent — multiplicador de streak', () => {
  it('streak de 7 dias (multiplier 1.2) arredonda corretamente', async () => {
    db.userStreak.upsert.mockResolvedValue(makeStreak());
    // Simulate streak already set to 7; update returns multiplier 1.2
    db.userStreak.update.mockResolvedValue(
      makeStreak({ currentStreak: 7, multiplier: 1.2 })
    );

    const result = await emitEvent('u1', 'ANSWER_QUESTION', {
      difficulty: 'MEDIUM',
      correct: true,
    });

    // base=7, with 1.2× → round(7 * 1.2) = 8
    expect(result.xpDelta).toBe(8);
  });

  it('streak de 3 dias (multiplier 1.1) arredonda corretamente', async () => {
    db.userStreak.update.mockResolvedValue(
      makeStreak({ currentStreak: 3, multiplier: 1.1 })
    );

    const result = await emitEvent('u1', 'ANSWER_QUESTION', {
      difficulty: 'EASY',
      correct: true,
    });

    // base=5, with 1.1× → round(5 * 1.1) = 6 (rounded from 5.5 → JS rounds to 6)
    expect(result.xpDelta).toBe(Math.round(5 * 1.1));
  });
});

describe('emitEvent — level up', () => {
  it('leveledUp=false quando XP não cruza threshold', async () => {
    db.userXp.upsert.mockResolvedValue(makeXp({ totalXp: 0, level: 1 }));
    db.userXp.update.mockResolvedValue(makeXp({ totalXp: 5, level: 1 }));

    const result = await emitEvent('u1', 'ANSWER_QUESTION', {
      difficulty: 'EASY',
      correct: true,
    });

    expect(result.leveledUp).toBe(false);
  });

  it('leveledUp=true quando XP cruza para nível 2', async () => {
    // Level 2 threshold = 50*(2-1) + 10*(2-1)^2 = 60 XP
    const threshold2 = LEVEL_THRESHOLDS[1].xpRequired; // index 1 = level 2
    db.userXp.upsert.mockResolvedValue(makeXp({ totalXp: threshold2 - 5, level: 1 }));
    db.userXp.update.mockResolvedValue(makeXp({ totalXp: threshold2 + 5, level: 2 }));

    const result = await emitEvent('u1', 'ANSWER_QUESTION', {
      difficulty: 'MEDIUM',
      correct: true,
    });

    expect(result.leveledUp).toBe(true);
    expect(result.level).toBe(2);
  });
});

// ─── Subject progress ─────────────────────────────────────────────────────────

describe('updateSubjectProgress', () => {
  it('chama prisma.userProgress.upsert com increment correto em acerto', async () => {
    await updateSubjectProgress('u1', 'Matemática', true);
    expect(db.userProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_subject: { userId: 'u1', subject: 'Matemática' } },
        update: expect.objectContaining({
          questionsAnswered: { increment: 1 },
          questionsCorrect: { increment: 1 },
        }),
      })
    );
  });

  it('questionsCorrect não incrementa em erro', async () => {
    await updateSubjectProgress('u1', 'Matemática', false);
    expect(db.userProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          questionsCorrect: { increment: 0 },
        }),
      })
    );
  });
});

// ─── Badge checking ───────────────────────────────────────────────────────────

describe('checkBadges', () => {
  it('primeira resposta concede progress.first_question', async () => {
    const awarded = await checkBadges('u1', 'ANSWER_QUESTION', {});
    expect(awarded.map(b => b.key)).toContain('progress.first_question');
  });

  it('badge não é concedida duas vezes (usuário já tem)', async () => {
    db.userBadge.findMany.mockResolvedValue([
      { badgeKey: 'progress.first_question' },
    ]);
    const awarded = await checkBadges('u1', 'ANSWER_QUESTION', {});
    expect(awarded.map(b => b.key)).not.toContain('progress.first_question');
  });

  it('badge mock.first concedida ao finalizar FINISH_MOCK', async () => {
    const awarded = await checkBadges('u1', 'FINISH_MOCK', {});
    expect(awarded.map(b => b.key)).toContain('mock.first');
  });

  it('badge essay.first concedida ao SUBMIT_ESSAY', async () => {
    const awarded = await checkBadges('u1', 'SUBMIT_ESSAY', {});
    expect(awarded.map(b => b.key)).toContain('essay.first');
  });

  it('badge subject.matematica.bronze concedida com 10 acertos em Matemática', async () => {
    db.userProgress.findUnique.mockResolvedValue({
      questionsCorrect: 10,
    });
    const awarded = await checkBadges('u1', 'ANSWER_QUESTION', {
      subject: 'Matemática',
      correct: true,
    });
    expect(awarded.map(b => b.key)).toContain('subject.matematica.bronze');
  });

  it('badge habit.streak_7 concedida com streak >= 7', async () => {
    db.userStreak.findUnique.mockResolvedValue({ currentStreak: 7 });
    const awarded = await checkBadges('u1', 'ANSWER_QUESTION', {});
    expect(awarded.map(b => b.key)).toContain('habit.streak_7');
  });
});

// ─── getState ─────────────────────────────────────────────────────────────────

describe('getState', () => {
  beforeEach(() => {
    db.userXp.findUnique.mockResolvedValue(makeXp({ totalXp: 0, level: 1 }));
    db.userStreak.findUnique.mockResolvedValue(makeStreak());
    db.userBadge.findMany.mockResolvedValue([]);
    // userProgress.findMany needs to exist (added to mock in setup.js)
    if (db.userProgress.findMany) {
      db.userProgress.findMany.mockResolvedValue([]);
    }
  });

  it('retorna estrutura completa com defaults para usuário sem dados', async () => {
    db.userXp.findUnique.mockResolvedValue(null);
    db.userStreak.findUnique.mockResolvedValue(null);

    const state = await getState('u1');

    expect(state.xp.totalXp).toBe(0);
    expect(state.xp.level).toBe(1);
    expect(state.streak.currentStreak).toBe(0);
    expect(state.streak.multiplier).toBe(1.0);
    expect(state.badges).toEqual([]);
    expect(state.progress).toEqual([]);
  });

  it('title e nextLevelXp refletem o nível do usuário', async () => {
    db.userXp.findUnique.mockResolvedValue(makeXp({ totalXp: 100, level: 2 }));

    const state = await getState('u1');

    expect(state.xp.level).toBe(2);
    expect(state.nextLevelXp).toBeDefined();
    expect(state.nextLevelXp).toBeGreaterThan(0);
  });

  it('badges são mapeadas para o formato correto', async () => {
    db.userBadge.findMany.mockResolvedValue([
      {
        awardedAt: new Date(),
        badge: BADGES[0], // progress.first_question
      },
    ]);

    const state = await getState('u1');
    expect(state.badges).toHaveLength(1);
    expect(state.badges[0].key).toBe('progress.first_question');
    expect(state.badges[0].awardedAt).toBeDefined();
  });
});
