/**
 * auth.integration.test.js
 * ------------------------
 * Integration tests for authentication endpoints.
 * Uses a real database (DATABASE_URL env var).
 *
 * Tested routes:
 *   POST /api/auth/register
 *   POST /api/auth/login   (no fingerprint path)
 *   GET  /api/auth/me
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { createTestUser, createAuthedUser, authHeader } from './helpers.js';

describe('POST /api/auth/register', () => {
  it('creates user and returns 201 with message + userId', async () => {
    const email = `reg-${Date.now()}@test.studr`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, name: 'Reg Test', password: 'Test@1234' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ message: expect.any(String), userId: expect.any(String) });
  });

  it('returns 400 when email already exists', async () => {
    const user = await createTestUser();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: user.email, name: 'Dup', password: 'Test@1234' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cadastrado/i);
  });
});

describe('POST /api/auth/login', () => {
  it('returns 200 with token + user for verified user (no fingerprint)', async () => {
    const { user, _plainPassword } = await createTestUser({ isVerified: true });
    // createTestUser stores the plain password as _plainPassword
    const plain = user._plainPassword ?? 'Test@1234';

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: plain });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({ email: user.email });
  });

  it('returns 401 for wrong password', async () => {
    const { user } = await createTestUser({ isVerified: true });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'WrongPass!9' });

    expect(res.status).toBe(401);
  });

  it('returns 401 for unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.studr', password: 'Test@1234' });

    expect(res.status).toBe(401);
  });

  it('returns 403 for unverified user', async () => {
    const { user } = await createTestUser({ isVerified: false });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'Test@1234' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/verificado/i);
  });

  it('returns 403 for blocked user', async () => {
    const { user } = await createTestUser({ isVerified: true, isBlocked: true });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'Test@1234' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/bloqueada/i);
  });
});

describe('GET /api/auth/me', () => {
  it('returns 200 with user payload for valid token', async () => {
    const { user, token } = await createAuthedUser();
    const res = await request(app)
      .get('/api/auth/me')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: user.email, id: user.id });
  });

  it('returns 401 when no token provided', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 403 for malformed token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.valid.jwt');

    expect(res.status).toBe(403);
  });

  it('returns 401 when session token rotated (single-session enforcement)', async () => {
    const { user, token } = await createAuthedUser();

    // Simulate login on another device: rotate sessionToken in DB
    const { prisma } = await import('./integrationSetup.js');
    await prisma.user.update({
      where: { id: user.id },
      data: { sessionToken: 'rotated-session-token' },
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set(authHeader(token));

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/sessão expirada/i);
  });
});
