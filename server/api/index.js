const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const { drawNumbers, runDraw } = require('../lib/draw');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_x');
const app = express();
// Allow the deployed client and local development
const allowed = [process.env.CLIENT_URL, 'http://localhost:5173'].filter(Boolean);
app.use(cors({ origin: (origin, cb) => cb(null, !origin || !process.env.CLIENT_URL || allowed.includes(origin)) }));

// Stripe webhook (raw body): keeps subscription state in sync (renew / cancel / lapse)
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let ev;
  try { ev = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET); }
  catch { return res.status(400).send('bad signature'); }
  const o = ev.data.object;
  const STATUS = { active: 'active', trialing: 'active', canceled: 'cancelled', past_due: 'lapsed', unpaid: 'lapsed', incomplete: 'inactive', incomplete_expired: 'inactive' };
  if (ev.type === 'checkout.session.completed') {
    if (o.metadata?.kind === 'donation') {   // one-off donation: never touches subscriptions or draw eligibility
      if (o.payment_status === 'paid') await db.from('donations').upsert({ user_id: o.metadata.user_id, charity_id: o.metadata.charity_id, amount: o.amount_total / 100, stripe_session_id: o.id }, { onConflict: 'stripe_session_id' });
    } else {
      const plan = o.metadata.plan;
      const monthly = plan === 'yearly' ? process.env.YEARLY_PRICE / 12 : process.env.MONTHLY_PRICE;
      await db.from('subscriptions').upsert({ user_id: o.metadata.user_id, plan, status: 'active', monthly_amount: monthly, stripe_sub_id: o.subscription });
    }
  }
  if (ev.type === 'customer.subscription.updated' || ev.type === 'customer.subscription.deleted') {
    const status = ev.type.endsWith('deleted') ? 'cancelled' : (STATUS[o.status] || 'inactive');
    await db.from('subscriptions').update({ status, cancel_at_period_end: !!o.cancel_at_period_end,
      current_period_end: new Date((o.items?.data?.[0]?.current_period_end ?? o.current_period_end) * 1000) }).eq('stripe_sub_id', o.id);
  }
  res.json({ received: true });
});

app.use(express.json({ limit: '5mb' }));   // proof images arrive as base64 (max 3 MB file)
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
const { validScore, charityFields } = require('../lib/validate');

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
  const { data, error } = await q;
  if (error) throw error;   // e.g. table missing: shows the real reason instead of null
  res.json(data);
}));

app.get('/api/me', auth, (req, res) => res.json({ id: req.user.id, email: req.user.email, full_name: req.user.full_name, role: req.user.role, active: req.user.active }));

// Subscriber
app.post('/api/checkout', auth, wrap(async (req, res) => {
  const plan = req.body.plan === 'yearly' ? 'yearly' : 'monthly';
  const s = await stripe.checkout.sessions.create({
    mode: 'subscription', customer_email: req.user.email,
    line_items: [{ quantity: 1, price_data: { currency: 'inr', unit_amount: Math.round(+process.env[plan === 'yearly' ? 'YEARLY_PRICE' : 'MONTHLY_PRICE'] * 100),
      recurring: { interval: plan === 'yearly' ? 'year' : 'month' }, product_data: { name: `Digital Heroes ${plan} plan` } } }],
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
const PROOF_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
app.post('/api/winners/:id/proof', auth, wrap(async (req, res) => {   // real upload to private Supabase Storage bucket 'proofs'
  const ext = PROOF_TYPES[req.body.type];
  if (!ext) throw new Error('Only PNG, JPG or WebP images are accepted');
  const buf = Buffer.from(req.body.data || '', 'base64');
  if (!buf.length || buf.length > 3 * 1024 * 1024) throw new Error('Image must be under 3 MB');
  const { data: w } = await db.from('winners').select('id, user_id, verification, proof_url').eq('id', req.params.id).maybeSingle();
  if (!w || w.user_id !== req.user.id) throw new Error('This is not your winning entry');
  if (!['awaiting', 'rejected'].includes(w.verification)) throw new Error('Proof already submitted');
  const path = `${req.user.id}/${w.id}-${Date.now()}.${ext}`;
  const { error } = await db.storage.from('proofs').upload(path, buf, { contentType: req.body.type });
  if (error) throw error;
  if (w.proof_url) await db.storage.from('proofs').remove([w.proof_url]);
  await db.from('winners').update({ proof_url: path, verification: 'submitted' }).eq('id', w.id);
  res.json({ ok: true });
}));
app.get('/api/dashboard', auth, wrap(async (req, res) => {
  const [scores, wins, draws, charity] = await Promise.all([
    db.from('scores').select('*').eq('user_id', req.user.id).order('played_on', { ascending: false }),
    db.from('winners').select('*, draws(month)').eq('user_id', req.user.id),
    db.from('draws').select('id, month, numbers').eq('status', 'published').order('created_at', { ascending: false }),
    db.from('charities').select('*').eq('id', req.user.charity_id).maybeSingle()]);
  res.json({ subscription: req.user.subscription, scores: scores.data, charity: charity.data, charity_pct: req.user.charity_pct,
    drawsEntered: draws.data.length, pastDraws: draws.data, winnings: wins.data,
    totalWon: wins.data.filter(w => w.verification === 'approved').reduce((a, w) => a + Number(w.amount), 0) });
}));

app.get('/api/charities/:id', wrap(async (req, res) => {
  const { data, error } = await db.from('charities').select('*').eq('id', req.params.id).single();
  if (error) throw new Error('Charity not found');
  res.json(data);
}));
app.post('/api/donate', auth, wrap(async (req, res) => {   // independent donation via Checkout; recorded only by the verified webhook
  const amt = Math.round(+req.body.amount);
  if (!(amt >= 50 && amt <= 100000)) throw new Error('Enter an amount between 50 and 100000');
  const { data: c } = await db.from('charities').select('id, name').eq('id', req.body.charity_id).maybeSingle();
  if (!c) throw new Error('Charity not found');
  const s = await stripe.checkout.sessions.create({ mode: 'payment', customer_email: req.user.email,
    line_items: [{ quantity: 1, price_data: { currency: 'inr', unit_amount: amt * 100, product_data: { name: `Donation to ${c.name}` } } }],
    metadata: { kind: 'donation', user_id: req.user.id, charity_id: c.id },
    success_url: `${process.env.CLIENT_URL}/charities/${c.id}?donated=1`, cancel_url: `${process.env.CLIENT_URL}/charities/${c.id}` });
  res.json({ url: s.url });
}));
app.post('/api/billing-portal', auth, wrap(async (req, res) => {   // Stripe Customer Portal: manage or cancel own subscription
  if (!req.user.subscription?.stripe_sub_id) throw new Error('No subscription found');
  const sub = await stripe.subscriptions.retrieve(req.user.subscription.stripe_sub_id);
  const p = await stripe.billingPortal.sessions.create({ customer: sub.customer, return_url: `${process.env.CLIENT_URL}/dashboard` });
  res.json({ url: p.url });
}));

// Admin
const admin = express.Router(); admin.use(auth, needAdmin);
admin.get('/users/:id', wrap(async (req, res) => {
  const [p, sc] = await Promise.all([db.from('profiles').select('*, subscriptions(*), charities(name)').eq('id', req.params.id).single(),
    db.from('scores').select('*').eq('user_id', req.params.id).order('played_on', { ascending: false })]);
  res.json({ ...p.data, scores: sc.data });
}));
admin.patch('/users/:id', wrap(async (req, res) => {
  const { full_name, role, charity_pct } = req.body, patch = {};
  if (full_name !== undefined) patch.full_name = String(full_name).slice(0, 100);
  if (['subscriber', 'admin'].includes(role)) {
    if (req.params.id === req.user.id && role !== 'admin') throw new Error('You cannot remove your own admin role');
    patch.role = role;
  }
  if (charity_pct !== undefined) { if (!(charity_pct >= 10 && charity_pct <= 100)) throw new Error('Contribution must be 10-100%'); patch.charity_pct = charity_pct; }
  res.json((await db.from('profiles').update(patch).eq('id', req.params.id).select().single()).data);
}));
admin.patch('/users/:id/subscription', wrap(async (req, res) => {   // manual override; Stripe webhooks overwrite it on the next event
  if (!['active', 'inactive', 'cancelled', 'lapsed'].includes(req.body.status)) throw new Error('Invalid status');
  const { data } = await db.from('subscriptions').update({ status: req.body.status }).eq('user_id', req.params.id).select().maybeSingle();
  if (!data) throw new Error('This user has no subscription record');
  res.json(data);
}));
admin.delete('/users/:id/scores/:sid', wrap(async (req, res) => { await db.from('scores').delete().eq('id', req.params.sid).eq('user_id', req.params.id); res.json({ ok: true }); }));
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
    pool: { ...r.pool, participants: users.length, preview: r.winners }, jackpot_carry: r.jackpotCarry }).select().single();
  res.json(data);
}));
admin.post('/draws/:id/publish', wrap(async (req, res) => {
  const { data: d } = await db.from('draws').select('*').eq('id', req.params.id).single();
  if (d.status === 'published') throw new Error('Already published');
  if (d.pool.preview.length) await db.from('winners').insert(d.pool.preview.map(w => ({ ...w, draw_id: d.id })));
  await db.from('draws').update({ status: 'published' }).eq('id', d.id); res.json({ ok: true });
}));
admin.get('/users', wrap(async (req, res) => res.json((await db.from('profiles').select('*, subscriptions(*), charities(name)')).data)));
admin.put('/users/:id/scores/:sid', wrap(async (req, res) => { validScore(req.body.score);
  res.json((await db.from('scores').update({ score: req.body.score }).eq('id', req.params.sid).eq('user_id', req.params.id).select().single()).data); }));
admin.post('/charities', wrap(async (req, res) => res.json((await db.from('charities').insert(charityFields(req.body)).select().single()).data)));
admin.put('/charities/:id', wrap(async (req, res) => res.json((await db.from('charities').update(charityFields(req.body)).eq('id', req.params.id).select().single()).data)));
admin.delete('/charities/:id', wrap(async (req, res) => { await db.from('charities').delete().eq('id', req.params.id); res.json({ ok: true }); }));
admin.get('/winners', wrap(async (req, res) => {
  const { data } = await db.from('winners').select('*, profiles(full_name,email), draws(month)');
  res.json(await Promise.all(data.map(async w => ({ ...w, proof_signed: w.proof_url ? (await db.storage.from('proofs').createSignedUrl(w.proof_url, 600)).data?.signedUrl : null }))));
}));
admin.patch('/winners/:id', wrap(async (req, res) => {   // enforced state machine: submitted -> approved/rejected, rejected -> awaiting, approved -> paid
  const { verification, payment } = req.body;
  const { data: w } = await db.from('winners').select('*').eq('id', req.params.id).single();
  const patch = {};
  if (verification) {
    if (w.verification !== { approved: 'submitted', rejected: 'submitted', awaiting: 'rejected' }[verification]) throw new Error(`Cannot move from ${w.verification} to ${verification}`);
    patch.verification = verification;
  }
  if (payment === 'paid') { if (w.verification !== 'approved') throw new Error('Approve the proof before marking paid'); patch.payment = 'paid'; }
  res.json((await db.from('winners').update(patch).eq('id', w.id).select().single()).data);
}));
admin.get('/reports', wrap(async (req, res) => {   // all values computed from real rows
  const pct = +process.env.PRIZE_POOL_PCT || 0.5;
  const [u, d, dr, w, sb] = await Promise.all([db.from('profiles').select('id', { count: 'exact', head: true }), db.from('donations').select('amount'),
    db.from('draws').select('month, pool, jackpot_carry').eq('status', 'published').order('created_at'), db.from('winners').select('amount, payment'),
    db.from('subscriptions').select('monthly_amount, status, profiles(charity_pct)')]);
  const act = sb.data.filter(x => x.status === 'active'), fee = act.reduce((a, x) => a + Number(x.monthly_amount), 0);
  res.json({ totalUsers: u.count, activeSubscribers: act.length, monthlyPrizePool: fee * pct,
    charityContributions: act.reduce((a, x) => a + Number(x.monthly_amount) * (x.profiles?.charity_pct || 10) / 100, 0),
    donations: d.data.reduce((a, x) => a + Number(x.amount), 0), draws: dr.data, winnersCount: w.data.length,
    totalPayouts: w.data.filter(x => x.payment === 'paid').reduce((a, x) => a + Number(x.amount), 0), jackpotRollover: dr.data.at(-1)?.jackpot_carry || 0 });
}));
app.use('/api/admin', admin);

module.exports = app;
