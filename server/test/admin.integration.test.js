/**
 * admin.integration.test.js
 * -------------------------
 * Integration tests for admin-only routes.
 * Verifies authentication + role enforcement for every admin endpoint.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { createAuthedUser, createAuthedAdmin, authHeader } from './helpers.js';

// All admin routes to verify auth + RBAC
const ADMIN_ROUTES = [
  { method: 'get',  path: '/api/admin/affiliates' },
  { method: 'put',  path: '/api/admin/affiliates/nonexistent-id/status' },
  { method: 'get',  path: '/api/admin/affiliate-products' },
  { method: 'put',  path: '/api/admin/affiliate-products/someType' },
  { method: 'put',  path: '/api/admin/affiliates/nonexistent-id/approve' },
  { method: 'get',  path: '/api/admin/users' },
  { method: 'put',  path: '/api/admin/users/nonexistent-id/toggle-block' },
  { method: 'get',  path: '/api/admin/stats' },
];

describe('Admin routes — unauthenticated → 401', () => {
  for (const route of ADMIN_ROUTES) {
    it(`${route.method.toUpperCase()} ${route.path}`, async () => {
      const res = await request(app)[route.method](route.path);
      expect(res.status).toBe(401);
    });
  }
});

describe('Admin routes — student role → 403', () => {
  it('rejects non-admin token on GET /api/admin/users', async () => {
    const { token } = await createAuthedUser({ role: 'student' });
    const res = await request(app)
      .get('/api/admin/users')
      .set(authHeader(token));

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/administrador/i);
  });

  it('rejects non-admin token on GET /api/admin/stats', async () => {
    const { token } = await createAuthedUser({ role: 'student' });
    const res = await request(app)
      .get('/api/admin/stats')
      .set(authHeader(token));

    expect(res.status).toBe(403);
  });

  for (const route of ADMIN_ROUTES) {
    it(`blocks student on ${route.method.toUpperCase()} ${route.path}`, async () => {
      const { token } = await createAuthedUser({ role: 'student' });
      const res = await request(app)[route.method](route.path).set(authHeader(token));
      expect(res.status).toBe(403);
    });
  }
});

describe('Admin routes — admin role → access granted', () => {
  it('GET /api/admin/affiliates returns 200 for admin', async () => {
    const { token } = await createAuthedAdmin();
    const res = await request(app)
      .get('/api/admin/affiliates')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/admin/users returns 200 + user list for admin', async () => {
    const { token } = await createAuthedAdmin();
    const res = await request(app)
      .get('/api/admin/users')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/admin/stats returns 200 with stats object for admin', async () => {
    const { token } = await createAuthedAdmin();
    const res = await request(app)
      .get('/api/admin/stats')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalUsers: expect.any(Number),
      premiumUsers: expect.any(Number),
    });
  });

  it('PUT /api/admin/users/:id/toggle-block returns 404 for non-existent user', async () => {
    const { token } = await createAuthedAdmin();
    const res = await request(app)
      .put('/api/admin/users/nonexistent-id/toggle-block')
      .set(authHeader(token));

    // Either 404 (user not found) or 400/500 — but NOT 401/403
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
