import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { createAuthedUser, authHeader } from './helpers.js';

describe('Security Mitigations - Express API', () => {

  describe('Payload Size Restrictions', () => {
    it('returns 413 Payload Too Large when body size exceeds 1MB', async () => {
      // Create a payload larger than 1MB (roughly 1.1 million characters)
      const hugePayload = 'a'.repeat(1.1 * 1024 * 1024);
      
      const res = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send({ email: 'test@studr.com', password: 'password', extra: hugePayload });

      expect(res.status).toBe(413);
    });
  });

  describe('AI Route Text Length Restrictions', () => {
    it('blocks essays exceeding 10,000 characters with a 400 Bad Request', async () => {
      const { token } = await createAuthedUser();
      const largeEssay = 'a'.repeat(10005);

      const res = await request(app)
        .post('/api/ai/evaluate-essay')
        .set(authHeader(token))
        .send({ theme: 'O Impacto da Inteligência Artificial', essayText: largeEssay });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('limite máximo de 10.000 caracteres');
    });

    it('blocks chat messages exceeding 2,000 characters with a 400 Bad Request', async () => {
      const { token } = await createAuthedUser();
      const largeMessage = 'a'.repeat(2005);

      const res = await request(app)
        .post('/api/ai/chat')
        .set(authHeader(token))
        .send({ history: [], newMessage: largeMessage });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('limite máximo de 2.000 caracteres');
    });
  });
});
