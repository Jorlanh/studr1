/**
 * helpers.js
 * ----------
 * Utilities for integration tests: create users, sign JWTs, build authed requests.
 */

import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { prisma } from './integrationSetup.js';

const JWT_SECRET = process.env.JWT_SECRET || 'studr_secret_key';

/**
 * Creates a user in the DB and returns the full record.
 * Email should end with @test.studr so afterEach cleanup picks it up.
 */
export async function createTestUser(overrides = {}) {
  const email = overrides.email ?? `user-${randomUUID()}@test.studr`;
  const password = overrides.password ?? 'Test@1234';
  const hashedPassword = await bcrypt.hash(password, 4); // low rounds for speed

  const user = await prisma.user.create({
    data: {
      email,
      name: overrides.name ?? 'Test User',
      password: hashedPassword,
      isVerified: overrides.isVerified ?? true,
      isPremium: overrides.isPremium ?? false,
      role: overrides.role ?? 'student',
      isBlocked: overrides.isBlocked ?? false,
      trialEndsAt: overrides.trialEndsAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subscriptionStatus: overrides.subscriptionStatus ?? null,
      trialQuestionsDate: overrides.trialQuestionsDate ?? null,
      trialQuestionsUsed: overrides.trialQuestionsUsed ?? 0,
      currentLeague: overrides.currentLeague ?? 'BRONZE',
    },
  });

  return { ...user, _plainPassword: password };
}

/**
 * Creates a user + a valid sessionToken + JWT.
 * Returns { user, token } — token is a Bearer-ready string.
 */
export async function createAuthedUser(overrides = {}) {
  const user = await createTestUser(overrides);
  const sessionToken = randomUUID();

  await prisma.user.update({
    where: { id: user.id },
    data: { sessionToken },
  });

  const token = jwt.sign(
    { userId: user.id, email: user.email, sessionToken },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  return { user: { ...user, sessionToken }, token };
}

/**
 * Creates an admin user with a valid token.
 */
export async function createAuthedAdmin(overrides = {}) {
  return createAuthedUser({ ...overrides, role: 'admin' });
}

/**
 * Shorthand: returns the Authorization header value for supertest.
 */
export function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}
