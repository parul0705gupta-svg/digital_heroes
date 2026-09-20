const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const { drawNumbers, runDraw } = require('../lib/draw');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_x');
const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || true }));

// Stripe webhook (raw body): keeps subscription state in sync (renew / cancel / lapse)
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let ev;
  try { ev = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET); }
  catch { return res.status(400).send('bad signature'); }
  const o = ev.data.object;
  if (ev.type === 'checkout.session.completed') {
    const plan = o.metadata.plan;
    const monthly = plan === 'yearly' ? process.env.YEARLY_PRICE / 12 : process.env.MONTHLY_PRICE;
    await db.from('subscriptions').upsert({ user_id: o.metadata.user_id, plan, status: 'active', monthly_amount: monthly, stripe_sub_id: o.subscription });
  }
  if (ev.type === 'customer.subscription.updated' || ev.type === 'customer.subscription.deleted') {
    const status = ev.type.endsWith('deleted') ? 'cancelled' : o.status === 'active' ? 'active' : 'lapsed';
    await db.from('subscriptions').update({ status, current_period_end: new Date(o.current_period_end * 1000) }).eq('stripe_sub_id', o.id);
  }
  res.json({ received: true });
});

app.use(express.json());
const wrap = fn => (req, res) => fn(req, res).catch(e => res.status(400).json({ error: e.message }));

// Auth: verify Supabase JWT, load role + live subscription status on every request (PRD section 04)
async function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: 'Unauthenticated' });
  const [{ data: profile }, { data: sub }] = await Promise.all([
    db.from('profiles').select('*').eq('id', data.user.id).single(),
    db.from('subscriptions').select('*').eq('user_id', data.user.id).maybeSingle()]);
  req.user = { ...profile, subscription: sub, active: sub?.status === 'active' };
  next();
}
const needActive = (req, res, next) => req.user.active ? next() : res.status(402).json({ error: 'Active subscription required' });
const needAdmin = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only' });
const validScore = s => { if (!Number.isInteger(s) || s < 1 || s > 45) throw new Error('Score must be a whole number from 1 to 45'); };

// Public
app.post('/api/signup', wrap(async (req, res) => {
  const { email, password, full_name, charity_id } = req.body;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  await db.from('profiles').insert({ id: data.user.id, email, full_name, charity_id });
  res.json({ id: data.user.id });
}));
app.get('/api/charities', wrap(async (req, res) => {
  let q = db.from('charities').select('*').order('featured', { ascending: false });
  if (req.query.q) q = q.ilike('name', `%${req.query.q}%`);
  res.json((await q).data);
}));

app.get('/api/me', auth, (req, res) => res.json({ id: req.user.id, email: req.user.email, full_name: req.user.full_name, role: req.user.role, active: req.user.active }));

// Subscriber
app.post('/api/checkout', auth, wrap(async (req, res) => {
  const plan = req.body.plan === 'yearly' ? 'yearly' : 'monthly';
  const s = await stripe.checkout.sessions.create({
    mode: 'subscription', customer_email: req.user.email,
    line_items: [{ price: process.env[`STRIPE_PRICE_${plan.toUpperCase()}`], quantity: 1 }],
    metadata: { user_id: req.user.id, plan },
    success_url: `${process.env.CLIENT_URL}/dashboard?paid=1`, cancel_url: `${process.env.CLIENT_URL}/pricing` });
  res.json({ url: s.url });
}));
app.get('/api/scores', auth, wrap(async (req, res) =>
  res.json((await db.from('scores').select('*').eq('user_id', req.user.id).order('played_on', { ascending: false })).data)));
app.post('/api/scores', auth, needActive, wrap(async (req, res) => {
  validScore(req.body.score);
  const { data, error } = await db.from('scores').insert({ user_id: req.user.id, score: req.body.score, played_on: req.body.played_on }).select().single();
  if (error) throw new Error(error.code === '23505' ? 'A score already exists for that date. Edit it instead.' : error.message);
  res.json(data);   // DB trigger drops the oldest beyond 5
}));
app.put('/api/scores/:id', auth, needActive, wrap(async (req, res) => {
  validScore(req.body.score);
  res.json((await db.from('scores').update({ score: req.body.score }).eq('id', req.params.id).eq('user_id', req.user.id).select().single()).data);
}));
app.delete('/api/scores/:id', auth, needActive, wrap(async (req, res) => {
  await db.from('scores').delete().eq('id', req.params.id).eq('user_id', req.user.id); res.json({ ok: true });
}));
app.patch('/api/me/charity', auth, wrap(async (req, res) => {
  const { charity_id, charity_pct } = req.body;
  if (!(charity_pct >= 10 && charity_pct <= 100)) throw new Error('Contribution must be between 10% and 100%');
  await db.from('profiles').update({ charity_id, charity_pct }).eq('id', req.user.id); res.json({ ok: true });
}));
app.post('/api/donations', auth, wrap(async (req, res) => {   // independent donation, not tied to gameplay
  res.json((await db.from('donations').insert({ user_id: req.user.id, charity_id: req.body.charity_id, amount: req.body.amount }).select().single()).data);
}));
app.post('/api/winners/:id/proof', auth, wrap(async (req, res) => {
  await db.from('winners').update({ proof_url: req.body.proof_url, verification: 'submitted' }).eq('id', req.params.id).eq('user_id', req.user.id); res.json({ ok: true });
}));
app.get('/api/dashboard', auth, wrap(async (req, res) => {
  const [scores, wins, draws, charity] = await Promise.all([
    db.from('scores').select('*').eq('user_id', req.user.id).order('played_on', { ascending: false }),
    db.from('winners').select('*, draws(month)').eq('user_id', req.user.id),
    db.from('draws').select('id, month').eq('status', 'published'),
    db.from('charities').select('*').eq('id', req.user.charity_id).maybeSingle()]);
  res.json({ subscription: req.user.subscription, scores: scores.data, charity: charity.data, charity_pct: req.user.charity_pct,
    drawsEntered: draws.data.length, winnings: wins.data,
    totalWon: wins.data.filter(w => w.verification === 'approved').reduce((a, w) => a + Number(w.amount), 0) });
}));

// Admin
const admin = express.Router(); admin.use(auth, needAdmin);
async function loadUsers() {   // active subscribers with their latest scores
  const { data } = await db.from('subscriptions').select('user_id, monthly_amount').eq('status', 'active');
  const { data: sc } = await db.from('scores').select('user_id, score');
  return data.map(s => ({ id: s.user_id, monthly_amount: s.monthly_amount, scores: sc.filter(x => x.user_id === s.user_id).map(x => x.score) }));
}
admin.post('/draws/simulate', wrap(async (req, res) => {   // simulation before publish
  const users = await loadUsers();
  const { data: last } = await db.from('draws').select('jackpot_carry').eq('status', 'published').order('created_at', { ascending: false }).limit(1);
  const numbers = drawNumbers(req.body.mode, users.flatMap(u => u.scores));
  const r = runDraw(numbers, users, +process.env.PRIZE_POOL_PCT || 0.5, last?.[0]?.jackpot_carry || 0);
  const { data } = await db.from('draws').insert({ month: req.body.month, mode: req.body.mode, numbers,
    pool: { ...r.pool, preview: r.winners }, jackpot_carry: r.jackpotCarry }).select().single();
  res.json(data);
}));
admin.post('/draws/:id/publish', wrap(async (req, res) => {
  const { data: d } = await db.from('draws').select('*').eq('id', req.params.id).single();
  if (d.status === 'published') throw new Error('Already published');
  if (d.pool.preview.length) await db.from('winners').insert(d.pool.preview.map(w => ({ ...w, draw_id: d.id })));
  await db.from('draws').update({ status: 'published' }).eq('id', d.id); res.json({ ok: true });
}));
admin.get('/users', wrap(async (req, res) => res.json((await db.from('profiles').select('*, subscriptions(*)')).data)));
admin.put('/users/:id/scores/:sid', wrap(async (req, res) => { validScore(req.body.score);
  res.json((await db.from('scores').update({ score: req.body.score }).eq('id', req.params.sid).select().single()).data); }));
admin.post('/charities', wrap(async (req, res) => res.json((await db.from('charities').insert(req.body).select().single()).data)));
admin.put('/charities/:id', wrap(async (req, res) => res.json((await db.from('charities').update(req.body).eq('id', req.params.id).select().single()).data)));
admin.delete('/charities/:id', wrap(async (req, res) => { await db.from('charities').delete().eq('id', req.params.id); res.json({ ok: true }); }));
admin.get('/winners', wrap(async (req, res) => res.json((await db.from('winners').select('*, profiles(full_name,email), draws(month)')).data)));
admin.patch('/winners/:id', wrap(async (req, res) => {   // approve/reject, then Pending -> Paid
  const { verification, payment } = req.body;
  res.json((await db.from('winners').update({ ...(verification && { verification }), ...(payment && { payment }) }).eq('id', req.params.id).select().single()).data);
}));
admin.get('/reports', wrap(async (req, res) => {
  const [u, d, w, s] = await Promise.all([db.from('profiles').select('id', { count: 'exact', head: true }),
    db.from('donations').select('amount'), db.from('draws').select('month, pool, status'), db.from('subscriptions').select('monthly_amount, status')]);
  const pool = s.data.filter(x => x.status === 'active').reduce((a, x) => a + Number(x.monthly_amount), 0) * (+process.env.PRIZE_POOL_PCT || 0.5);
  res.json({ totalUsers: u.count, monthlyPrizePool: pool, donations: d.data.reduce((a, x) => a + Number(x.amount), 0), draws: w.data });
}));
app.use('/api/admin', admin);

module.exports = app;
