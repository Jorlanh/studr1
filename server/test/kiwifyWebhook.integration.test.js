/**
 * kiwifyWebhook.integration.test.js
 * ---------------------------------
 * Integration tests for Kiwify Webhook endpoint.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from './integrationSetup.js';
import { createTestUser } from './helpers.js';

describe('POST /api/webhook/kiwify', () => {
  const token = 'test_kiwify_token_123';

  beforeAll(() => {
    process.env.KIWIFY_TOKEN = token;
  });

  it('rejects request with invalid token', async () => {
    const res = await request(app)
      .post('/api/webhook/kiwify?token=wrong_token')
      .send({
        order_status: 'paid',
        Customer: { email: 'buyer@test.studr', full_name: 'Buyer' }
      });

    expect(res.status).toBe(401);
  });

  it('accepts request with valid token and promotes flat payload customer', async () => {
    const email = 'buyer1@test.studr';
    // Ensure user doesn't exist
    await prisma.user.deleteMany({ where: { email } });

    const res = await request(app)
      .post(`/api/webhook/kiwify?token=${token}`)
      .send({
        order_status: 'paid',
        Customer: {
          email,
          full_name: 'Buyer Flat'
        },
        Product: {
          product_id: 'prod_123',
          product_name: 'Curso Anual'
        }
      });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).toBeTruthy();
    expect(user.isPremium).toBe(true);
    expect(user.subscriptionStatus).toBe('FULL');
  });

  it('accepts request and promotes customer with wrapped (data envelope) payload', async () => {
    const email = 'buyer2@test.studr';
    // Ensure user doesn't exist
    await prisma.user.deleteMany({ where: { email } });

    const res = await request(app)
      .post(`/api/webhook/kiwify?token=${token}`)
      .send({
        id: 'some-event-id',
        type: 'compra_aprovada',
        version: '1.0',
        data: {
          order_status: 'paid',
          Customer: {
            email,
            full_name: 'Buyer Wrapped'
          },
          Product: {
            product_id: 'prod_456',
            product_name: 'Curso Mensal'
          }
        }
      });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).toBeTruthy();
    expect(user.isPremium).toBe(true);
  });

  it('accepts request when webhook returns a subscription object', async () => {
    const email = 'buyer5@test.studr';
    await prisma.user.deleteMany({ where: { email } });

    const res = await request(app)
      .post(`/api/webhook/kiwify?token=${token}`)
      .send({
        order_status: 'paid',
        Customer: {
          email,
          full_name: 'Buyer Subscription'
        },
        Subscription: {
          plan_id: 'prod_789',
          planName: 'Curso Anual'
        }
      });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).toBeTruthy();
    expect(user.isPremium).toBe(true);
  });

  it('handles casing variants (approved, customer_email)', async () => {
    const email = 'buyer3@test.studr';
    await prisma.user.deleteMany({ where: { email } });

    const res = await request(app)
      .post(`/api/webhook/kiwify?token=${token}`)
      .send({
        status: 'approved',
        customer_email: email,
        customer_name: 'Casing Buyer'
      });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).toBeTruthy();
    expect(user.isPremium).toBe(true);
  });

  it('removes access on refunded/chargeback/canceled status', async () => {
    const email = 'buyer4@test.studr';
    await createTestUser({
      email,
      isPremium: true,
      subscriptionStatus: 'FULL'
    });

    const res = await request(app)
      .post(`/api/webhook/kiwify?token=${token}`)
      .send({
        order_status: 'refunded',
        Customer: { email }
      });

    expect(res.status).toBe(200);
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user.isPremium).toBe(false);
    expect(user.subscriptionStatus).toBe('CANCELED');
  });
});
