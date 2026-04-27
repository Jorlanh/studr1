/**
 * planService.test.js
 * -------------------
 * Unit tests for plan detection and usage quota enforcement.
 * Prisma is mocked via server/test/setup.js.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getUserPlan, checkAndConsumeQuestion, checkAndConsumeMock } from './planService.js';

const { _mock: db } = await import('@prisma/client');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
};

const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
};

const todayStr = () => new Date().toISOString().split('T')[0];

const makeUser = (overrides = {}) => ({
  isPremium: false,
  subscriptionStatus: null,
  trialEndsAt: tomorrow(),
  trialQuestionsDate: null,
  trialQuestionsUsed: 0,
  exams: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.user.update.mockResolvedValue({});
});

// ─── getUserPlan ──────────────────────────────────────────────────────────────

describe('getUserPlan', () => {
  it('isPremium=true → PREMIUM', () => {
    expect(getUserPlan({ isPremium: true })).toBe('PREMIUM');
  });

  it('subscriptionStatus=MOCK_ONLY → MOCK_ONLY', () => {
    expect(getUserPlan({ isPremium: false, subscriptionStatus: 'MOCK_ONLY', trialEndsAt: yesterday() })).toBe('MOCK_ONLY');
  });

  it('trial não expirado → TRIAL', () => {
    expect(getUserPlan({ isPremium: false, subscriptionStatus: null, trialEndsAt: tomorrow() })).toBe('TRIAL');
  });

  it('trial expirado → EXPIRED', () => {
    expect(getUserPlan({ isPremium: false, subscriptionStatus: null, trialEndsAt: yesterday() })).toBe('EXPIRED');
  });

  it('premium tem precedência sobre subscriptionStatus', () => {
    expect(getUserPlan({ isPremium: true, subscriptionStatus: 'MOCK_ONLY' })).toBe('PREMIUM');
  });
});

// ─── checkAndConsumeQuestion ─────────────────────────────────────────────────

describe('checkAndConsumeQuestion', () => {
  it('usuário premium: always allowed, sem incremento no banco', async () => {
    db.user.findUnique.mockResolvedValue(makeUser({ isPremium: true }));

    const result = await checkAndConsumeQuestion('u1');

    expect(result.allowed).toBe(true);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('usuário EXPIRED: bloqueado com reason TRIAL_EXPIRED', async () => {
    db.user.findUnique.mockResolvedValue(makeUser({ trialEndsAt: yesterday() }));

    const result = await checkAndConsumeQuestion('u1');

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('TRIAL_EXPIRED');
  });

  it('usuário MOCK_ONLY: bloqueado com PLAN_DOES_NOT_INCLUDE_PRACTICE', async () => {
    db.user.findUnique.mockResolvedValue(
      makeUser({ subscriptionStatus: 'MOCK_ONLY', trialEndsAt: yesterday() })
    );

    const result = await checkAndConsumeQuestion('u1');

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('PLAN_DOES_NOT_INCLUDE_PRACTICE');
  });

  it('trial abaixo do limite (0/10): permitido e incrementa contador', async () => {
    db.user.findUnique.mockResolvedValue(
      makeUser({ trialQuestionsDate: null, trialQuestionsUsed: 0 })
    );

    const result = await checkAndConsumeQuestion('u1');

    expect(result.allowed).toBe(true);
    expect(db.user.update).toHaveBeenCalled();
  });

  it('trial no limite (10/10): bloqueado com DAILY_LIMIT_REACHED', async () => {
    db.user.findUnique.mockResolvedValue(
      makeUser({ trialQuestionsDate: todayStr(), trialQuestionsUsed: 10 })
    );

    const result = await checkAndConsumeQuestion('u1');

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('DAILY_LIMIT_REACHED');
    expect(result.limit).toBe(10);
    expect(result.used).toBe(10);
  });

  it('trial com data de ontem zera o contador', async () => {
    db.user.findUnique.mockResolvedValue(
      makeUser({ trialQuestionsDate: '2000-01-01', trialQuestionsUsed: 10 })
    );

    const result = await checkAndConsumeQuestion('u1');

    expect(result.allowed).toBe(true); // counter reset for new day
  });

  it('userId inexistente: bloqueado com USER_NOT_FOUND', async () => {
    db.user.findUnique.mockResolvedValue(null);

    const result = await checkAndConsumeQuestion('ghost');

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('USER_NOT_FOUND');
  });
});

// ─── checkAndConsumeMock ──────────────────────────────────────────────────────

describe('checkAndConsumeMock', () => {
  it('premium: sempre permitido', async () => {
    db.user.findUnique.mockResolvedValue(makeUser({ isPremium: true }));

    const result = await checkAndConsumeMock('u1');

    expect(result.allowed).toBe(true);
  });

  it('trial sem simulado na semana: permitido', async () => {
    db.user.findUnique.mockResolvedValue(makeUser({ exams: [] }));

    const result = await checkAndConsumeMock('u1');

    expect(result.allowed).toBe(true);
  });

  it('trial com simulado já esta semana: WEEKLY_MOCK_LIMIT_REACHED', async () => {
    db.user.findUnique.mockResolvedValue(
      makeUser({
        exams: [{ createdAt: new Date() }], // created today
      })
    );

    const result = await checkAndConsumeMock('u1');

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('WEEKLY_MOCK_LIMIT_REACHED');
  });

  it('MOCK_ONLY sem simulado este mês: permitido', async () => {
    db.user.findUnique.mockResolvedValue(
      makeUser({
        subscriptionStatus: 'MOCK_ONLY',
        trialEndsAt: yesterday(),
        exams: [],
      })
    );

    const result = await checkAndConsumeMock('u1');

    expect(result.allowed).toBe(true);
  });

  it('MOCK_ONLY com simulado já este mês: MONTHLY_MOCK_LIMIT_REACHED', async () => {
    db.user.findUnique.mockResolvedValue(
      makeUser({
        subscriptionStatus: 'MOCK_ONLY',
        trialEndsAt: yesterday(),
        exams: [{ createdAt: new Date() }],
      })
    );

    const result = await checkAndConsumeMock('u1');

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('MONTHLY_MOCK_LIMIT_REACHED');
  });

  it('expired: TRIAL_EXPIRED', async () => {
    db.user.findUnique.mockResolvedValue(makeUser({ trialEndsAt: yesterday() }));

    const result = await checkAndConsumeMock('u1');

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('TRIAL_EXPIRED');
  });
});
