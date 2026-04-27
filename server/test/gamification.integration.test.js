/**
 * gamification.integration.test.js
 * ---------------------------------
 * Integration tests for gamification endpoints.
 *
 * Tested routes:
 *   POST /api/gamification/event
 *   GET  /api/gamification/state
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { createAuthedUser, authHeader } from './helpers.js';

describe('POST /api/gamification/event', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/gamification/event').send({ eventType: 'ANSWER_ANY' });
    expect(res.status).toBe(401);
  });

  it('returns 400 without eventType', async () => {
    const { token } = await createAuthedUser();
    const res = await request(app)
      .post('/api/gamification/event')
      .set(authHeader(token))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/eventType/i);
  });

  it('processes ANSWER_ANY event and returns xpDelta', async () => {
    const { token } = await createAuthedUser();
    const res = await request(app)
      .post('/api/gamification/event')
      .set(authHeader(token))
      .send({ eventType: 'ANSWER_ANY' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      xpDelta: expect.any(Number),
      totalXp: expect.any(Number),
      level: expect.any(Number),
      leveledUp: expect.any(Boolean),
      newBadges: expect.any(Array),
    });
    expect(res.body.xpDelta).toBeGreaterThan(0);
  });

  it('processes CORRECT_MEDIUM event and returns higher xpDelta', async () => {
    const { token } = await createAuthedUser();
    const res = await request(app)
      .post('/api/gamification/event')
      .set(authHeader(token))
      .send({ eventType: 'CORRECT_MEDIUM' });

    expect(res.status).toBe(200);
    expect(res.body.xpDelta).toBeGreaterThanOrEqual(5);
  });

  it('totalXp increases after multiple events', async () => {
    const { token } = await createAuthedUser();

    const r1 = await request(app)
      .post('/api/gamification/event')
      .set(authHeader(token))
      .send({ eventType: 'ANSWER_ANY' });

    const r2 = await request(app)
      .post('/api/gamification/event')
      .set(authHeader(token))
      .send({ eventType: 'ANSWER_ANY' });

    expect(r2.body.totalXp).toBeGreaterThan(r1.body.totalXp);
  });
});

describe('GET /api/gamification/state', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/gamification/state');
    expect(res.status).toBe(401);
  });

  it('returns full state for new user', async () => {
    const { token } = await createAuthedUser();
    const res = await request(app)
      .get('/api/gamification/state')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalXp: expect.any(Number),
      level: expect.any(Number),
      streak: expect.any(Number),
      badges: expect.any(Array),
    });
  });

  it('state reflects XP earned after event', async () => {
    const { token } = await createAuthedUser();

    await request(app)
      .post('/api/gamification/event')
      .set(authHeader(token))
      .send({ eventType: 'CORRECT_HARD' });

    const res = await request(app)
      .get('/api/gamification/state')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.totalXp).toBeGreaterThan(0);
  });
});
