// API tests with a fake Supabase and Stripe: covers auth, admin access, scores, charity %, proof ownership and webhooks
const test = require('node:test'); const assert = require('node:assert/strict'); const Module = require('module');
Object.assign(process.env, { SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k', STRIPE_SECRET_KEY: 'sk', STRIPE_WEBHOOK_SECRET: 'wh', MONTHLY_PRICE: '999', YEARLY_PRICE: '9999' });
const S = { results: {}, calls: [] };
const chain = table => {
  const c = { op: 'select' };
  const p = new Proxy(c, { get(t, k) {
    if (typeof k === 'symbol') return undefined;
    if (k === 'then') { const r = S.results[`${table}:${c.op}`] ?? { data: null, error: null }; return res => res(r); }
    return (...a) => { if (['select', 'insert', 'update', 'upsert', 'delete'].includes(k) && !(k === 'select' && c.op !== 'select')) { c.op = k; S.calls.push({ table, op: k, args: a }); } return p; };
  } });
  return p;
};
const fakeDb = { from: chain,
  auth: { getUser: async t => (t ? { data: { user: { id: t } }, error: null } : { data: {}, error: { message: 'none' } }), admin: { createUser: async () => ({ data: { user: { id: 'new' } }, error: null }) } },
  storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({}), createSignedUrl: async () => ({ data: { signedUrl: 'u' } }) }) } };
class FakeStripe { constructor() { this.webhooks = { constructEvent: (b, sig) => { if (sig !== 'good') throw new Error('bad signature'); return JSON.parse(b); } }; } }
const orig = Module._load;
Module._load = function (r, ...a) { if (r === '@supabase/supabase-js') return { createClient: () => fakeDb }; if (r === 'stripe') return FakeStripe; return orig.call(this, r, ...a); };
const app = require('../api/index.js'); Module._load = orig;

let server, base;
test.before(() => new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => { server.closeAllConnections?.(); server.close(); });
const reset = (results = {}) => { S.results = results; S.calls = []; };
const call = (path, { method = 'GET', token, body, headers } = {}) => fetch(base + path, { method, body: body && JSON.stringify(body),
  headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...headers } });
const SUB = { 'profiles:select': { data: { id: 'u1', role: 'subscriber', charity_pct: 10 } }, 'subscriptions:select': { data: { status: 'active' } } };
const hook = (type, object) => call('/api/webhook', { method: 'POST', headers: { 'stripe-signature': 'good' }, body: { type, data: { object } } });
const find = (table, op) => S.calls.find(c => c.table === table && c.op === op);

test('AUTH: request without a token is rejected', async () => { reset(); assert.equal((await call('/api/scores')).status, 401); });
test('AUTH: subscriber is blocked from admin routes', async () => { reset(SUB); assert.equal((await call('/api/admin/users', { token: 'u1' })).status, 403); });
test('AUTH: admin is allowed', async () => { reset({ 'profiles:select': { data: { id: 'a', role: 'admin' } } }); assert.equal((await call('/api/admin/users', { token: 'a' })).status, 200); });
test('SUBSCRIPTION: inactive subscriber cannot add scores', async () => {
  reset({ ...SUB, 'subscriptions:select': { data: { status: 'inactive' } } });
  assert.equal((await call('/api/scores', { method: 'POST', token: 'u1', body: { score: 20, played_on: '2026-09-01' } })).status, 402);
});
test('SCORES: 0 and 46 rejected, 1 and 45 accepted', async () => {
  reset({ ...SUB, 'scores:insert': { data: { id: 1 }, error: null } });
  for (const [score, code] of [[0, 400], [46, 400], [1, 200], [45, 200]]) assert.equal((await call('/api/scores', { method: 'POST', token: 'u1', body: { score, played_on: '2026-09-01' } })).status, code, `score ${score}`);
});
test('SCORES: duplicate date is rejected with a clear message', async () => {
  reset({ ...SUB, 'scores:insert': { data: null, error: { code: '23505', message: 'dup' } } });
  const r = await call('/api/scores', { method: 'POST', token: 'u1', body: { score: 20, played_on: '2026-09-01' } });
  assert.equal(r.status, 400); assert.match((await r.json()).error, /already exists/);
});
test('CHARITY: contribution below 10% rejected, 10% accepted', async () => {
  reset(SUB);
  assert.equal((await call('/api/me/charity', { method: 'PATCH', token: 'u1', body: { charity_id: '22222222-2222-4222-8222-222222222222', charity_pct: 5 } })).status, 400);
  assert.equal((await call('/api/me/charity', { method: 'PATCH', token: 'u1', body: { charity_id: '22222222-2222-4222-8222-222222222222', charity_pct: 10 } })).status, 200);
});
test('WINNER: cannot upload proof for another user\'s win, or a non-image', async () => {
  reset({ ...SUB, 'winners:select': { data: { id: '11111111-1111-4111-8111-111111111111', user_id: 'someone-else', verification: 'awaiting' } } });
  const r = await call('/api/winners/11111111-1111-4111-8111-111111111111/proof', { method: 'POST', token: 'u1', body: { type: 'image/png', data: 'aGk=' } });
  assert.equal(r.status, 400); assert.match((await r.json()).error, /not your winning entry/);
  assert.equal((await call('/api/winners/11111111-1111-4111-8111-111111111111/proof', { method: 'POST', token: 'u1', body: { type: 'image/gif', data: 'aGk=' } })).status, 400);
});
test('WINNER: owner upload marks proof as submitted', async () => {
  reset({ ...SUB, 'winners:select': { data: { id: '11111111-1111-4111-8111-111111111111', user_id: 'u1', verification: 'awaiting' } } });
  assert.equal((await call('/api/winners/11111111-1111-4111-8111-111111111111/proof', { method: 'POST', token: 'u1', body: { type: 'image/png', data: 'aGk=' } })).status, 200);
  assert.equal(find('winners', 'update').args[0].verification, 'submitted');
});
test('WINNER: admin cannot mark paid before approval', async () => {
  reset({ 'profiles:select': { data: { id: 'a', role: 'admin' } }, 'winners:select': { data: { id: '11111111-1111-4111-8111-111111111111', verification: 'submitted' } } });
  assert.equal((await call('/api/admin/winners/11111111-1111-4111-8111-111111111111', { method: 'PATCH', token: 'a', body: { payment: 'paid' } })).status, 400);
});
test('STRIPE: bad webhook signature is rejected', async () => {
  reset(); assert.equal((await call('/api/webhook', { method: 'POST', headers: { 'stripe-signature': 'bad' }, body: { type: 'x' } })).status, 400);
});
test('STRIPE: checkout completion activates a yearly subscription', async () => {
  reset(); assert.equal((await hook('checkout.session.completed', { metadata: { user_id: 'u1', plan: 'yearly' }, subscription: 'sub_1' })).status, 200);
  const row = find('subscriptions', 'upsert').args[0]; assert.equal(row.status, 'active'); assert.equal(row.monthly_amount, 9999 / 12);
});
for (const [stripeStatus, ours] of [['active', 'active'], ['past_due', 'lapsed'], ['unpaid', 'lapsed'], ['incomplete', 'inactive'], ['canceled', 'cancelled']]) {
  test(`STRIPE: subscription ${stripeStatus} is stored as ${ours}`, async () => {
    reset(); await hook('customer.subscription.updated', { id: 'sub_1', status: stripeStatus, cancel_at_period_end: false, current_period_end: 1790000000 });
    assert.equal(find('subscriptions', 'update').args[0].status, ours);
  });
}
test('STRIPE: deleted subscription becomes cancelled', async () => {
  reset(); await hook('customer.subscription.deleted', { id: 'sub_1', status: 'canceled', current_period_end: 1790000000 });
  assert.equal(find('subscriptions', 'update').args[0].status, 'cancelled');
});
test('STRIPE: donation is recorded and never touches subscriptions', async () => {
  reset(); await hook('checkout.session.completed', { id: 'cs_1', payment_status: 'paid', amount_total: 50000, metadata: { kind: 'donation', user_id: 'u1', charity_id: '22222222-2222-4222-8222-222222222222' } });
  assert.equal(find('donations', 'upsert').args[0].amount, 500); assert.equal(find('subscriptions', 'upsert'), undefined);
});

const W = '11111111-1111-4111-8111-111111111111', ADMIN = { 'profiles:select': { data: { id: 'a', role: 'admin' } } };
test('VALIDATION: malformed id is rejected before touching the database', async () => {
  reset(ADMIN); assert.equal((await call('/api/admin/winners/not-a-uuid', { method: 'PATCH', token: 'a', body: { payment: 'paid' } })).status, 400);
});
test('SCORES: editing the date to an existing date is rejected gracefully', async () => {
  reset({ ...SUB, 'scores:update': { data: null, error: { code: '23505' } } });
  const r = await call(`/api/scores/${W}`, { method: 'PUT', token: 'u1', body: { played_on: '2026-09-01' } });
  assert.equal(r.status, 400); assert.match((await r.json()).error, /already exists/);
});
test('SCORES: date edit is saved; invalid and future dates are refused', async () => {
  reset({ ...SUB, 'scores:update': { data: { id: W }, error: null } });
  assert.equal((await call(`/api/scores/${W}`, { method: 'PUT', token: 'u1', body: { score: 30, played_on: '2026-09-01' } })).status, 200);
  assert.equal(find('scores', 'update').args[0].played_on, '2026-09-01');
  for (const bad of ['2999-01-01', 'abc', '2026-02-31']) assert.equal((await call('/api/scores', { method: 'POST', token: 'u1', body: { score: 20, played_on: bad } })).status, 400, bad);
});
test('DRAW: a draw can be published once, a second publish is refused', async () => {
  reset({ ...ADMIN, 'draws:update': { data: { id: W, pool: { preview: [] } }, error: null } });
  assert.equal((await call(`/api/admin/draws/${W}/publish`, { method: 'POST', token: 'a' })).status, 200);
  reset({ ...ADMIN, 'draws:update': { data: null, error: null } });
  assert.equal((await call(`/api/admin/draws/${W}/publish`, { method: 'POST', token: 'a' })).status, 400);
});
test('WINNER: rejection reason is stored and approved -> paid is allowed', async () => {
  reset({ ...ADMIN, 'winners:select': { data: { id: W, verification: 'submitted' } } });
  await call(`/api/admin/winners/${W}`, { method: 'PATCH', token: 'a', body: { verification: 'rejected', reason: 'Screenshot is blurry' } });
  assert.equal(find('winners', 'update').args[0].rejection_reason, 'Screenshot is blurry');
  reset({ ...ADMIN, 'winners:select': { data: { id: W, verification: 'approved' } } });
  assert.equal((await call(`/api/admin/winners/${W}`, { method: 'PATCH', token: 'a', body: { payment: 'paid' } })).status, 200);
});
test('ERRORS: database internals are never leaked to users', async () => {
  reset({ ...SUB, 'scores:insert': { data: null, error: { code: 'XX000', message: 'relation secret_table violates constraint' } } });
  const r = await call('/api/scores', { method: 'POST', token: 'u1', body: { score: 20, played_on: '2026-09-01' } });
  assert.equal(r.status, 400); assert.doesNotMatch(JSON.stringify(await r.json()), /secret_table/);
});
test('DONATION: invalid charity id or amount is refused before Stripe is called', async () => {
  reset(SUB);
  assert.equal((await call('/api/donate', { method: 'POST', token: 'u1', body: { charity_id: 'x', amount: 500 } })).status, 400);
  assert.equal((await call('/api/donate', { method: 'POST', token: 'u1', body: { charity_id: W, amount: 10 } })).status, 400);
});
test('ERRORS: malformed JSON returns a safe message, not a stack trace', async () => {
  const r = await fetch(`${base}/api/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(r.status, 400); assert.doesNotMatch(await r.text(), /at .*\.js/);
});
