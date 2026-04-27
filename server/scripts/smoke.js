/**
 * smoke.js
 * --------
 * Production smoke tests: verifies the live API is healthy after a deploy.
 * Exits with code 0 on success, 1 on failure.
 *
 * Usage:
 *   BASE_URL=https://api.studr.com.br node server/scripts/smoke.js
 *
 * Required env vars:
 *   BASE_URL         - API base URL (e.g. https://api.studr.com.br)
 *   SMOKE_EMAIL      - Email of a real test/premium account on prod
 *   SMOKE_PASSWORD   - Password for that account
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
const SMOKE_EMAIL = process.env.SMOKE_EMAIL;
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD;

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}

async function get(path, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  return { res, body: await res.json() };
}

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return { res, body: await res.json() };
}

async function main() {
  console.log(`\n[smoke] Testing ${BASE_URL}\n`);

  // 1. Health
  await check('GET /api/health → 200', async () => {
    const { res, body } = await get('/api/health');
    if (res.status !== 200) throw new Error(`status ${res.status}`);
    if (body.status !== 'ok') throw new Error(`status field: ${body.status}`);
  });

  // 2. Auth — login
  let token = null;
  if (SMOKE_EMAIL && SMOKE_PASSWORD) {
    await check('POST /api/auth/login → 200 + token', async () => {
      const { res, body } = await post('/api/auth/login', {
        email: SMOKE_EMAIL,
        password: SMOKE_PASSWORD,
      });
      if (res.status !== 200) throw new Error(`status ${res.status}: ${JSON.stringify(body)}`);
      if (!body.token) throw new Error('no token in response');
      token = body.token;
    });

    if (token) {
      // 3. Auth/me
      await check('GET /api/auth/me → 200', async () => {
        const { res, body } = await get('/api/auth/me', token);
        if (res.status !== 200) throw new Error(`status ${res.status}`);
        if (!body.user?.email) throw new Error('no user.email');
      });

      // 4. Gamification state
      await check('GET /api/gamification/state → 200', async () => {
        const { res } = await get('/api/gamification/state', token);
        if (res.status !== 200) throw new Error(`status ${res.status}`);
      });

      // 5. Ranking
      await check('GET /api/ranking → 200', async () => {
        const { res, body } = await get('/api/ranking', token);
        if (res.status !== 200) throw new Error(`status ${res.status}`);
        if (!body.league) throw new Error('no league field');
      });

      // 6. Practice start (check only — does not consume)
      await check('POST /api/practice/start → 200 or 403 (quota exhausted is ok)', async () => {
        const { res } = await post('/api/practice/start', {}, token);
        if (res.status !== 200 && res.status !== 403) {
          throw new Error(`unexpected status ${res.status}`);
        }
      });
    }
  } else {
    console.log('  (skipping auth tests — SMOKE_EMAIL/SMOKE_PASSWORD not set)');
  }

  // 7. Unauthenticated calls return 401
  await check('GET /api/auth/me without token → 401', async () => {
    const { res } = await get('/api/auth/me');
    if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
  });

  await check('GET /api/ranking without token → 401', async () => {
    const { res } = await get('/api/ranking');
    if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
  });

  // Summary
  console.log(`\n[smoke] ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('[smoke] Fatal error:', err);
  process.exit(1);
});
