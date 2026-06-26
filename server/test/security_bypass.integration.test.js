import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from './integrationSetup.js';
import { createAuthedUser, createAuthedAdmin, authHeader } from './helpers.js';

describe('Security Controls - Mass Assignment & Role Bypass', () => {

  describe('PUT /api/users/update (Mass Assignment Protection)', () => {
    it('updates allowed common fields (name) but ignores privileged fields (role, isPremium, xp)', async () => {
      // 1. Cria um usuário comum autenticado (default role: student, isPremium: false, xp: 0)
      const { user, token } = await createAuthedUser({
        name: 'Original Name',
        role: 'student',
        isPremium: false,
        xp: 0
      });

      // 2. Tenta fazer um ataque de Mass Assignment enviando parâmetros restritos no body
      const res = await request(app)
        .put('/api/users/update')
        .set(authHeader(token))
        .send({
          name: 'Modified Name',
          role: 'ADMIN',
          isPremium: true,
          xp: 99999,
          level: 100
        });

      // 3. Verifica se a resposta HTTP é 200 OK
      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Modified Name');
      // A resposta do payload do usuário não deve conter os privilégios atualizados
      expect(res.body.user.role).not.toBe('ADMIN');
      expect(res.body.user.isPremium).toBe(false);

      // 4. Verifica diretamente no Banco de Dados (Prisma) se os privilégios foram blindados e mantidos intactos
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id }
      });

      expect(dbUser.name).toBe('Modified Name');
      expect(dbUser.role.toLowerCase()).toBe('student'); // mantém student
      expect(dbUser.isPremium).toBe(false); // mantém false
      expect(dbUser.xp).toBe(0); // mantém 0
      expect(dbUser.level).toBe(1); // mantém 1
    });

    it('returns 400 Bad Request if no valid field is sent for update', async () => {
      const { token } = await createAuthedUser();

      const res = await request(app)
        .put('/api/users/update')
        .set(authHeader(token))
        .send({
          role: 'ADMIN',
          isPremium: true
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Nenhum campo válido enviado');
    });
  });

  describe('GET /api/premium/features (Direct DB Premium Verification)', () => {
    it('blocks access with 403 Forbidden if the user is not Premium in the DB', async () => {
      const { token } = await createAuthedUser({ isPremium: false });

      const res = await request(app)
        .get('/api/premium/features')
        .set(authHeader(token));

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Acesso negado');
    });

    it('allows access with 200 OK if the user is Premium in the DB', async () => {
      const { token } = await createAuthedUser({ isPremium: true });

      const res = await request(app)
        .get('/api/premium/features')
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Bem-vindo à área Premium!');
      expect(res.body.features).toBeInstanceOf(Array);
    });
  });

  describe('Flexible role-based access control (checkRole / requireAdmin)', () => {
    it('blocks a non-admin user (student) from accessing admin routes with 403 Forbidden', async () => {
      const { token } = await createAuthedUser({ role: 'student' });

      const res = await request(app)
        .get('/api/admin/stats')
        .set(authHeader(token));

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Acesso restrito ao administrador');
    });

    it('allows an admin user to access admin routes with 200 OK', async () => {
      const { token } = await createAuthedAdmin();

      const res = await request(app)
        .get('/api/admin/stats')
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalUsers');
      expect(res.body).toHaveProperty('premiumUsers');
    });
  });
});
