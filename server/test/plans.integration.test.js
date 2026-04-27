/**
 * plans.integration.test.js
 * -------------------------
 * Integration tests for plan enforcement endpoints.
 *
 * Tested routes:
 *   POST /api/practice/start
 *   POST /api/mock/start
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { createAuthedUser, authHeader } from './helpers.js';

describe('POST /api/practice/start', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/practice/start');
    expect(res.status).toBe(401);
  });

  it('allows a premium user (no quota limit)', async () => {
    const { token } = await createAuthedUser({
      isPremium: true,
      subscriptionStatus: 'FULL',
      trialEndsAt: new Date('2099-01-01'),
    });

    const res = await request(app)
      .post('/api/practice/start')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('allows a trial user with questions remaining', async () => {
    const { token } = await createAuthedUser({
      isPremium: false,
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      trialQuestionsDate: null,
      trialQuestionsUsed: 0,
    });

    const res = await request(app)
      .post('/api/practice/start')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('blocks a trial user who exhausted daily quota', async () => {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const { token } = await createAuthedUser({
      isPremium: false,
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      trialQuestionsDate: today,
      trialQuestionsUsed: 10, // at daily limit
    });

    const res = await request(app)
      .post('/api/practice/start')
      .set(authHeader(token));

    expect(res.status).toBe(403);
    expect(res.body.error).toBeTruthy();
  });

  it('blocks a user with expired trial', async () => {
    const { token } = await createAuthedUser({
      isPremium: false,
      trialEndsAt: new Date(Date.now() - 1000), // expired 1 second ago
      trialQuestionsDate: null,
      trialQuestionsUsed: 0,
    });

    const res = await request(app)
      .post('/api/practice/start')
      .set(authHeader(token));

    expect(res.status).toBe(403);
  });
});

describe('POST /api/mock/start', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/mock/start');
    expect(res.status).toBe(401);
  });

  it('allows premium user to start mock exam', async () => {
    const { token } = await createAuthedUser({
      isPremium: true,
      subscriptionStatus: 'FULL',
      trialEndsAt: new Date('2099-01-01'),
    });

    const res = await request(app)
      .post('/api/mock/start')
      .set(authHeader(token))
      .send({ mode: 'FULL' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.examId).toBeTruthy();
  });

  it('blocks expired trial user from starting mock exam', async () => {
    const { token } = await createAuthedUser({
      isPremium: false,
      trialEndsAt: new Date(Date.now() - 1000),
    });

    const res = await request(app)
      .post('/api/mock/start')
      .set(authHeader(token));

    expect(res.status).toBe(403);
  });
});
