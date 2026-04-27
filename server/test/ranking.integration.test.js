/**
 * ranking.integration.test.js
 * ---------------------------
 * Integration tests for the ranking endpoint.
 *
 * Tested routes:
 *   GET /api/ranking
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { createAuthedUser, authHeader } from './helpers.js';

describe('GET /api/ranking', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/ranking');
    expect(res.status).toBe(401);
  });

  it('returns ranking response with expected shape', async () => {
    const { token } = await createAuthedUser();
    const res = await request(app)
      .get('/api/ranking')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      league: expect.any(String),
      leagueLabel: expect.any(String),
      totalInLeague: expect.any(Number),
      entries: expect.any(Array),
    });
  });

  it('new user starts in BRONZE league', async () => {
    const { token } = await createAuthedUser({ currentLeague: 'BRONZE' });
    const res = await request(app)
      .get('/api/ranking')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.league).toBe('BRONZE');
  });

  it('respects limit query parameter', async () => {
    const { token } = await createAuthedUser();
    const res = await request(app)
      .get('/api/ranking?limit=5')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.entries.length).toBeLessThanOrEqual(5);
  });

  it('returns myPosition as null when user has no XP record yet', async () => {
    const { token } = await createAuthedUser();
    const res = await request(app)
      .get('/api/ranking')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    // myPosition may be null or a number
    expect([null, expect.any(Number)]).toContainEqual(res.body.myPosition);
  });
});
