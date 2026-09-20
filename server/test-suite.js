const assert = require('assert');
const http = require('http');
const { createClient } = require('@supabase/supabase-js');
const { drawNumbers, matchCount, runDraw } = require('./lib/draw');
const app = require('./api/index');

async function runTests() {
  console.log('--- STARTING DIGITAL HEROES COMPREHENSIVE TEST SUITE ---\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`FAIL: ${name}\n  Error: ${err.message}`);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`FAIL: ${name}\n  Error: ${err.message}`);
      failed++;
    }
  }

  // 1. Draw Engine Tests
  console.log('=== [1] Testing Draw Engine (lib/draw.js) ===');

  test('drawNumbers(random) produces 5 unique numbers within 1..45', () => {
    for (let i = 0; i < 50; i++) {
      const nums = drawNumbers('random');
      assert.strictEqual(nums.length, 5, 'Must draw exactly 5 numbers');
      const unique = new Set(nums);
      assert.strictEqual(unique.size, 5, 'All numbers must be distinct');
      nums.forEach(n => {
        assert(Number.isInteger(n), 'Number must be integer');
        assert(n >= 1 && n <= 45, `Number ${n} must be between 1 and 45`);
      });
      // Verify sorted ascending
      for (let j = 1; j < nums.length; j++) {
        assert(nums[j] > nums[j - 1], 'Must be sorted ascending');
      }
    }
  });

  test('drawNumbers(algorithmic) handles empty and populated score arrays safely', () => {
    const numsEmpty = drawNumbers('algorithmic', []);
    assert.strictEqual(numsEmpty.length, 5);

    const numsFrequencies = drawNumbers('algorithmic', [10, 10, 10, 10, 25, 25, 'invalid', null, 99]);
    assert.strictEqual(numsFrequencies.length, 5);
    const unique = new Set(numsFrequencies);
    assert.strictEqual(unique.size, 5);
  });

  test('matchCount calculates accurate matches', () => {
    assert.strictEqual(matchCount([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]), 5);
    assert.strictEqual(matchCount([1, 2, 3, 4, 5], [1, 2, 3, 10, 20]), 3);
    assert.strictEqual(matchCount([1, 2, 3, 4, 5], [10, 20, 30, 40, 45]), 0);
    assert.strictEqual(matchCount([5, 5, 5, 5, 5], [5, 10, 15, 20, 25]), 1); // Deduplicated scores
  });

  test('runDraw computes pools, tiers, winners, and rollover jackpot carry', () => {
    const users = [
      { id: 'u1', scores: [1, 2, 3, 4, 5], monthly_amount: 1000 },
      { id: 'u2', scores: [1, 2, 3, 4, 10], monthly_amount: 1000 },
      { id: 'u3', scores: [1, 2, 3, 10, 11], monthly_amount: 1000 },
      { id: 'u4', scores: [20, 21, 22, 23, 24], monthly_amount: 1000 }
    ];
    const drawn = [1, 2, 3, 4, 5];
    const result = runDraw(drawn, users, 0.5, 200);

    // Total monthly pool = 4 * 1000 * 0.5 = 2000
    assert.strictEqual(result.pool.total, 2000);
    // Tier 5: 2000 * 0.40 + 200 (carry) = 1000
    assert.strictEqual(result.pool.tiers[5], 1000);
    // Tier 4: 2000 * 0.35 = 700
    assert.strictEqual(result.pool.tiers[4], 700);
    // Tier 3: 2000 * 0.25 = 500
    assert.strictEqual(result.pool.tiers[3], 500);

    // u1 matched 5, u2 matched 4, u3 matched 3
    assert.strictEqual(result.pool.winnerCounts[5], 1);
    assert.strictEqual(result.pool.winnerCounts[4], 1);
    assert.strictEqual(result.pool.winnerCounts[3], 1);
    // Jackpot won -> carry is 0
    assert.strictEqual(result.jackpotCarry, 0);

    // Verify winners details
    const w5 = result.winners.find(w => w.tier === 5);
    assert.strictEqual(w5.user_id, 'u1');
    assert.strictEqual(w5.amount, 1000);

    const w4 = result.winners.find(w => w.tier === 4);
    assert.strictEqual(w4.user_id, 'u2');
    assert.strictEqual(w4.amount, 700);

    const w3 = result.winners.find(w => w.tier === 3);
    assert.strictEqual(w3.user_id, 'u3');
    assert.strictEqual(w3.amount, 500);
  });

  test('runDraw correctly rolls over jackpot when no user matches 5 numbers', () => {
    const users = [
      { id: 'u1', scores: [1, 2, 3, 10, 11], monthly_amount: 1000 }
    ];
    const drawn = [1, 2, 3, 4, 5];
    const result = runDraw(drawn, users, 0.5, 500);

    assert.strictEqual(result.pool.winnerCounts[5], 0);
    // Tier 5 is 1000 * 0.5 * 0.4 + 500 = 700
    assert.strictEqual(result.jackpotCarry, 700);
  });

  // 2. Score and Charity Validation Rules
  console.log('\n=== [2] Testing Score & Charity Validation Rules ===');

  test('validScore rejects out-of-range, non-integer, or empty scores', () => {
    const validScore = s => { if (!Number.isInteger(s) || s < 1 || s > 45) throw new Error('Score must be a whole number from 1 to 45'); };
    
    assert.throws(() => validScore(0), /Score must be a whole number/);
    assert.throws(() => validScore(46), /Score must be a whole number/);
    assert.throws(() => validScore(-5), /Score must be a whole number/);
    assert.throws(() => validScore(12.5), /Score must be a whole number/);
    assert.throws(() => validScore('25'), /Score must be a whole number/);
    assert.throws(() => validScore(null), /Score must be a whole number/);
    
    assert.doesNotThrow(() => validScore(1));
    assert.doesNotThrow(() => validScore(45));
    assert.doesNotThrow(() => validScore(28));
  });

  test('charity contribution percentage accepts only 10% to 100%', () => {
    const validatePct = p => {
      const n = Number(p);
      if (!(n >= 10 && n <= 100)) throw new Error('Contribution must be between 10% and 100%');
    };

    assert.throws(() => validatePct(0), /Contribution must be between 10% and 100%/);
    assert.throws(() => validatePct(9), /Contribution must be between 10% and 100%/);
    assert.throws(() => validatePct(101), /Contribution must be between 10% and 100%/);
    assert.throws(() => validatePct('abc'), /Contribution must be between 10% and 100%/);

    assert.doesNotThrow(() => validatePct(10));
    assert.doesNotThrow(() => validatePct(50));
    assert.doesNotThrow(() => validatePct(100));
  });

  // 3. Database Connectivity & Schema
  console.log('\n=== [3] Testing Live Supabase Database Connectivity & Tables ===');

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  await asyncTest('Connected to Supabase and verified all tables exist', async () => {
    const tables = ['profiles', 'charities', 'subscriptions', 'scores', 'draws', 'winners', 'donations'];
    for (const t of tables) {
      const { data, error } = await db.from(t).select('*').limit(1);
      assert.ifError(error, `Failed to query table ${t}: ${error?.message}`);
      assert(Array.isArray(data), `Expected array data from ${t}`);
    }
  });

  await asyncTest('Charities table has seeded records with required fields', async () => {
    const { data, error } = await db.from('charities').select('*');
    assert.ifError(error);
    assert(data.length > 0, 'Charities table must have seeded entries');
    const c = data[0];
    assert(c.id, 'Charity must have an id');
    assert(c.name, 'Charity must have a name');
  });

  // 4. HTTP API Server Tests
  console.log('\n=== [4] Testing Express API Endpoints & Middleware ===');

  const server = http.createServer(app);
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  async function request(path, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const req = http.request(url, options, res => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            const json = body ? JSON.parse(body) : null;
            resolve({ status: res.statusCode, headers: res.headers, body: json, rawBody: body });
          } catch (e) {
            resolve({ status: res.statusCode, headers: res.headers, rawBody: body });
          }
        });
      });
      req.on('error', reject);
      if (options.body) req.write(options.body);
      req.end();
    });
  }

  await asyncTest('GET /api/charities returns 200 with charity array', async () => {
    const res = await request('/api/charities');
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.body), 'Response must be an array');
    assert(res.body.length > 0, 'Should return charities');
  });

  await asyncTest('GET /api/charities?q=Clean searches and filters correctly', async () => {
    const res = await request('/api/charities?q=Clean');
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.body));
    assert(res.body.every(c => c.name.toLowerCase().includes('clean')));
  });

  await asyncTest('POST /api/signup without required fields returns 400', async () => {
    const res = await request('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(res.status, 400);
    assert(res.body?.error, 'Should return error message');
  });

  await asyncTest('Unauthenticated access to protected routes returns 401', async () => {
    const getRoutes = ['/api/me', '/api/scores', '/api/dashboard'];
    for (const r of getRoutes) {
      const res = await request(r);
      assert.strictEqual(res.status, 401, `${r} must return 401 when not authenticated`);
      assert.strictEqual(res.body?.error, 'Unauthenticated');
    }
    const postRes = await request('/api/checkout', { method: 'POST' });
    assert.strictEqual(postRes.status, 401, '/api/checkout must return 401 when not authenticated');
    assert.strictEqual(postRes.body?.error, 'Unauthenticated');
  });

  await asyncTest('Unauthenticated access to admin routes returns 401', async () => {
    const adminRoutes = ['/api/admin/users', '/api/admin/reports', '/api/admin/winners'];
    for (const r of adminRoutes) {
      const res = await request(r);
      assert.strictEqual(res.status, 401, `${r} must return 401 when not authenticated`);
    }
  });

  await asyncTest('Stripe webhook rejects requests with invalid signature', async () => {
    const res = await request('/api/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': 'invalid_sig' },
      body: JSON.stringify({ test: true })
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.rawBody, 'bad signature');
  });

  await asyncTest('CORS allows localhost and headers correctly', async () => {
    const res = await request('/api/charities', {
      method: 'GET',
      headers: { Origin: 'http://localhost:5173' }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['access-control-allow-origin'], 'http://localhost:5173');
  });

  await asyncTest('Non-active subscriber gets 402 on score submission', async () => {
    // Generate a temporary test user in Supabase
    const testEmail = `test_${Date.now()}@example.com`;
    const testPass = 'password123';
    const signupRes = await request('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPass, full_name: 'Test User' })
    });
    assert.strictEqual(signupRes.status, 200);
    const userId = signupRes.body.id;

    // Login with Supabase auth using a separate client so admin db keeps service-role
    const userClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: authData, error: authErr } = await userClient.auth.signInWithPassword({ email: testEmail, password: testPass });
    assert.ifError(authErr);
    const token = authData.session.access_token;

    // GET /api/me works
    const meRes = await request('/api/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.body.email, testEmail);
    assert.strictEqual(meRes.body.active, false);

    // GET /api/dashboard works cleanly for brand new user with 0 history
    const dashRes = await request('/api/dashboard', {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(dashRes.status, 200);
    assert.strictEqual(dashRes.body.scores.length, 0);
    assert.strictEqual(dashRes.body.totalWon, 0);

    // PATCH /api/me/charity updates contribution
    const charityRes = await request('/api/me/charity', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ charity_pct: 25 })
    });
    assert.strictEqual(charityRes.status, 200);

    // Non-active subscriber posting score returns 402 Active subscription required
    const scoreRes = await request('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ score: 35, played_on: '2026-09-20' })
    });
    assert.strictEqual(scoreRes.status, 402);
    assert.strictEqual(scoreRes.body?.error, 'Active subscription required');

    // Admin access by subscriber returns 403 Admin only
    const adminRes = await request('/api/admin/users', {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(adminRes.status, 403);
    assert.strictEqual(adminRes.body?.error, 'Admin only');

    // Simulate active subscription directly in DB via service role client
    const subInsert = await db.from('subscriptions').insert({
      user_id: userId,
      plan: 'monthly',
      status: 'active',
      monthly_amount: 999
    });
    assert.ifError(subInsert.error);

    // Now subscriber has active subscription -> GET /api/me returns active: true
    const meActiveRes = await request('/api/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(meActiveRes.status, 200);
    assert.strictEqual(meActiveRes.body.active, true);

    // Can now add score
    const addScoreRes = await request('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ score: 40, played_on: '2026-09-15' })
    });
    assert.strictEqual(addScoreRes.status, 200);
    const scoreId = addScoreRes.body.id;
    assert.strictEqual(addScoreRes.body.score, 40);

    // Duplicate date check -> 400 error
    const dupScoreRes = await request('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ score: 30, played_on: '2026-09-15' })
    });
    assert.strictEqual(dupScoreRes.status, 400);
    assert(dupScoreRes.body?.error?.includes('already exists'), 'Should warn about duplicate date');

    // Edit score
    const editScoreRes = await request(`/api/scores/${scoreId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ score: 42 })
    });
    assert.strictEqual(editScoreRes.status, 200);
    assert.strictEqual(editScoreRes.body.score, 42);

    // Promote user to admin to test admin simulation and publish
    await db.from('profiles').update({ role: 'admin' }).eq('id', userId);

    // Admin draw simulation
    const simRes = await request('/api/admin/draws/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ month: '2026-09', mode: 'random' })
    });
    assert.strictEqual(simRes.status, 200);
    assert(simRes.body.id, 'Simulation should create a draw record');
    const drawId = simRes.body.id;

    // Admin publish draw
    const pubRes = await request(`/api/admin/draws/${drawId}/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(pubRes.status, 200);
    assert.strictEqual(pubRes.body.ok, true);

    // Clean up test draw and user
    await db.from('draws').delete().eq('id', drawId);
    await db.auth.admin.deleteUser(userId);
  });

  server.close();

  console.log(`\n======================================================`);
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
