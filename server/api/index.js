const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const { drawNumbers, runDraw } = require('../lib/draw');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_x');
const app = express();

// Allow the deployed client and local development
const allowed = [process.env.CLIENT_URL, 'http://localhost:5173', 'http://localhost:3000'].filter(Boolean);
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || !process.env.CLIENT_URL || allowed.includes(origin)),
  credentials: true
}));

// Stripe webhook (raw body): keeps subscription state in sync (renew / cancel / lapse)
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let ev;
  try { ev = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET); }
  catch { return res.status(400).send('bad signature'); }
  const o = ev.data.object;
  if (ev.type === 'checkout.session.completed') {
    const plan = o.metadata.plan;
    const monthly = plan === 'yearly' ? (Number(process.env.YEARLY_PRICE) || 9999) / 12 : (Number(process.env.MONTHLY_PRICE) || 999);
    await db.from('subscriptions').upsert({ user_id: o.metadata.user_id, plan, status: 'active', monthly_amount: monthly, stripe_sub_id: o.subscription });
  }
  if (ev.type === 'customer.subscription.updated' || ev.type === 'customer.subscription.deleted') {
    const status = ev.type.endsWith('deleted') ? 'cancelled' : o.status === 'active' ? 'active' : 'lapsed';
    await db.from('subscriptions').update({ status, current_period_end: new Date((o.items?.data?.[0]?.current_period_end ?? o.current_period_end) * 1000) }).eq('stripe_sub_id', o.id);
  }
  res.json({ received: true });
});

app.use(express.json());
const wrap = fn => (req, res) => fn(req, res).catch(e => res.status(400).json({ error: e.message }));

// Auth: verify Supabase JWT, load role + live subscription status on every request (PRD section 04)
async function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: 'Unauthenticated' });
  const [{ data: profile }, { data: sub }] = await Promise.all([
    db.from('profiles').select('*').eq('id', data.user.id).maybeSingle(),
    db.from('subscriptions').select('*').eq('user_id', data.user.id).maybeSingle()
  ]);
  req.user = { id: data.user.id, email: data.user.email, ...(profile || {}), subscription: sub || null, active: sub?.status === 'active' };
  next();
}
const needActive = (req, res, next) => req.user.active ? next() : res.status(402).json({ error: 'Active subscription required' });
const needAdmin = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only' });
const validScore = s => { if (!Number.isInteger(s) || s < 1 || s > 45) throw new Error('Score must be a whole number from 1 to 45'); };

// Public
app.post('/api/signup', wrap(async (req, res) => {
  const { email, password, full_name, charity_id } = req.body;
  if (!email || !password) throw new Error('Email and password are required');
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const { error: profileError } = await db.from('profiles').insert({ id: data.user.id, email, full_name, charity_id: charity_id || null });
  if (profileError) throw profileError;
  res.json({ id: data.user.id });
}));

app.get('/api/charities', wrap(async (req, res) => {
  let q = db.from('charities').select('*').order('featured', { ascending: false });
  if (req.query.q) q = q.ilike('name', `%${req.query.q}%`);
  const { data, error } = await q;
  if (error) throw error;
  res.json(data || []);
}));

app.get('/api/me', auth, (req, res) => res.json({ id: req.user.id, email: req.user.email, full_name: req.user.full_name, role: req.user.role, active: req.user.active }));

// Subscriber
app.post('/api/checkout', auth, wrap(async (req, res) => {
  const plan = req.body.plan === 'yearly' ? 'yearly' : 'monthly';
  const price = plan === 'yearly' ? (Number(process.env.YEARLY_PRICE) || 9999) : (Number(process.env.MONTHLY_PRICE) || 999);
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const s = await stripe.checkout.sessions.create({
    mode: 'subscription', customer_email: req.user.email,
    line_items: [{ quantity: 1, price_data: { currency: 'inr', unit_amount: Math.round(price * 100),
      recurring: { interval: plan === 'yearly' ? 'year' : 'month' }, product_data: { name: `Digital Heroes ${plan} plan` } } }],
    metadata: { user_id: req.user.id, plan },
    success_url: `${clientUrl}/dashboard?paid=1`, cancel_url: `${clientUrl}/pricing` });
  res.json({ url: s.url });
}));

app.get('/api/scores', auth, wrap(async (req, res) => {
  const { data, error } = await db.from('scores').select('*').eq('user_id', req.user.id).order('played_on', { ascending: false });
  if (error) throw error;
  res.json(data || []);
}));

app.post('/api/scores', auth, needActive, wrap(async (req, res) => {
  validScore(req.body.score);
  const { data, error } = await db.from('scores').insert({ user_id: req.user.id, score: req.body.score, played_on: req.body.played_on }).select().single();
  if (error) throw new Error(error.code === '23505' ? 'A score already exists for that date. Edit it instead.' : error.message);
  res.json(data);
}));

app.put('/api/scores/:id', auth, needActive, wrap(async (req, res) => {
  validScore(req.body.score);
  const { data, error } = await db.from('scores').update({ score: req.body.score }).eq('id', req.params.id).eq('user_id', req.user.id).select().single();
  if (error) throw error;
  res.json(data);
}));

app.delete('/api/scores/:id', auth, needActive, wrap(async (req, res) => {
  const { error } = await db.from('scores').delete().eq('id', req.params.id).eq('user_id', req.user.id);
  if (error) throw error;
  res.json({ ok: true });
}));

app.patch('/api/me/charity', auth, wrap(async (req, res) => {
  const { charity_id, charity_pct } = req.body;
  const pct = Number(charity_pct);
  if (!(pct >= 10 && pct <= 100)) throw new Error('Contribution must be between 10% and 100%');
  const updateData = { charity_pct: pct };
  if (charity_id) updateData.charity_id = charity_id;
  const { error } = await db.from('profiles').update(updateData).eq('id', req.user.id);
  if (error) throw error;
  res.json({ ok: true });
}));

app.post('/api/donations', auth, wrap(async (req, res) => {
  const { data, error } = await db.from('donations').insert({ user_id: req.user.id, charity_id: req.body.charity_id, amount: req.body.amount }).select().single();
  if (error) throw error;
  res.json(data);
}));

app.post('/api/winners/:id/proof', auth, wrap(async (req, res) => {
  const { error } = await db.from('winners').update({ proof_url: req.body.proof_url, verification: 'submitted' }).eq('id', req.params.id).eq('user_id', req.user.id);
  if (error) throw error;
  res.json({ ok: true });
}));

app.get('/api/dashboard', auth, wrap(async (req, res) => {
  const [scores, wins, draws, charity] = await Promise.all([
    db.from('scores').select('*').eq('user_id', req.user.id).order('played_on', { ascending: false }),
    db.from('winners').select('*, draws(month)').eq('user_id', req.user.id),
    db.from('draws').select('id, month').eq('status', 'published'),
    req.user.charity_id ? db.from('charities').select('*').eq('id', req.user.charity_id).maybeSingle() : { data: null }
  ]);
  const scoresList = scores.data || [];
  const winsList = wins.data || [];
  const drawsList = draws.data || [];
  res.json({
    subscription: req.user.subscription,
    scores: scoresList,
    charity: charity.data,
    charity_pct: req.user.charity_pct ?? 10,
    drawsEntered: drawsList.length,
    winnings: winsList,
    totalWon: winsList.filter(w => w.verification === 'approved').reduce((a, w) => a + Number(w.amount || 0), 0)
  });
}));

// Admin
const admin = express.Router();
admin.use(auth, needAdmin);

async function loadUsers() {
  const { data } = await db.from('subscriptions').select('user_id, monthly_amount').eq('status', 'active');
  const { data: sc } = await db.from('scores').select('user_id, score');
  const subs = data || [];
  const scores = sc || [];
  return subs.map(s => ({
    id: s.user_id,
    monthly_amount: s.monthly_amount,
    scores: scores.filter(x => x.user_id === s.user_id).map(x => x.score)
  }));
}

admin.post('/draws/simulate', wrap(async (req, res) => {
  const users = await loadUsers();
  const { data: last } = await db.from('draws').select('jackpot_carry').eq('status', 'published').order('created_at', { ascending: false }).limit(1);
  const numbers = drawNumbers(req.body.mode, users.flatMap(u => u.scores));
  const r = runDraw(numbers, users, +process.env.PRIZE_POOL_PCT || 0.5, last?.[0]?.jackpot_carry || 0);
  const { data, error } = await db.from('draws').insert({
    month: req.body.month,
    mode: req.body.mode,
    numbers,
    pool: { ...r.pool, preview: r.winners },
    jackpot_carry: r.jackpotCarry
  }).select().single();
  if (error) throw error;
  res.json(data);
}));

admin.post('/draws/:id/publish', wrap(async (req, res) => {
  const { data: d, error: fetchErr } = await db.from('draws').select('*').eq('id', req.params.id).single();
  if (fetchErr) throw fetchErr;
  if (d.status === 'published') throw new Error('Already published');
  if (d.pool?.preview?.length) {
    const { error: winErr } = await db.from('winners').insert(d.pool.preview.map(w => ({ ...w, draw_id: d.id })));
    if (winErr) throw winErr;
  }
  const { error: pubErr } = await db.from('draws').update({ status: 'published' }).eq('id', d.id);
  if (pubErr) throw pubErr;
  res.json({ ok: true });
}));

admin.get('/users', wrap(async (req, res) => {
  const { data, error } = await db.from('profiles').select('*, subscriptions(*)');
  if (error) throw error;
  res.json(data || []);
}));

admin.put('/users/:id/scores/:sid', wrap(async (req, res) => {
  validScore(req.body.score);
  const { data, error } = await db.from('scores').update({ score: req.body.score }).eq('id', req.params.sid).select().single();
  if (error) throw error;
  res.json(data);
}));

admin.post('/charities', wrap(async (req, res) => {
  const { data, error } = await db.from('charities').insert(req.body).select().single();
  if (error) throw error;
  res.json(data);
}));

admin.put('/charities/:id', wrap(async (req, res) => {
  const { data, error } = await db.from('charities').update(req.body).eq('id', req.params.id).select().single();
  if (error) throw error;
  res.json(data);
}));

admin.delete('/charities/:id', wrap(async (req, res) => {
  const { error } = await db.from('charities').delete().eq('id', req.params.id);
  if (error) throw error;
  res.json({ ok: true });
}));

admin.get('/winners', wrap(async (req, res) => {
  const { data, error } = await db.from('winners').select('*, profiles(full_name,email), draws(month)');
  if (error) throw error;
  res.json(data || []);
}));

admin.patch('/winners/:id', wrap(async (req, res) => {
  const { verification, payment } = req.body;
  const updateData = {};
  if (verification) updateData.verification = verification;
  if (payment) updateData.payment = payment;
  const { data, error } = await db.from('winners').update(updateData).eq('id', req.params.id).select().single();
  if (error) throw error;
  res.json(data);
}));

admin.get('/reports', wrap(async (req, res) => {
  const [u, d, w, s] = await Promise.all([
    db.from('profiles').select('id', { count: 'exact', head: true }),
    db.from('donations').select('amount'),
    db.from('draws').select('month, pool, status'),
    db.from('subscriptions').select('monthly_amount, status')
  ]);
  const subsList = s.data || [];
  const donationsList = d.data || [];
  const drawsList = w.data || [];
  const pool = subsList.filter(x => x.status === 'active').reduce((a, x) => a + Number(x.monthly_amount || 0), 0) * (+process.env.PRIZE_POOL_PCT || 0.5);
  res.json({
    totalUsers: u.count || 0,
    monthlyPrizePool: pool,
    donations: donationsList.reduce((a, x) => a + Number(x.amount || 0), 0),
    draws: drawsList
  });
}));

app.use('/api/admin', admin);

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Digital Heroes API server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
