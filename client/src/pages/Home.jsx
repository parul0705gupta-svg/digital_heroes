import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../api';

const balls = [7, 19, 24, 33, 41];
const split = [['Prize pool', 50, 'var(--accent)'], ['Your charity (minimum)', 10, 'var(--brand)'], ['Platform and payment costs', 40, 'var(--line)']];
const steps = [['01', 'Subscribe', 'Choose monthly, or yearly at a discount. At least 10% of your fee goes to the charity you pick.'],
  ['02', 'Log your scores', 'Keep your latest five Stableford scores, each from 1 to 45. A new score replaces your oldest.'],
  ['03', 'Match the draw', 'Every month five numbers are drawn. Match 3, 4 or 5 of them to win a share of the prize pool.']];
const Reveal = ({ children, delay = 0, ...p }) => <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.5, delay }} {...p}>{children}</motion.div>;

export default function Home() {
  const [c, setC] = useState(null);
  useEffect(() => { api('/charities').then(l => setC((Array.isArray(l) ? l : []).find(x => x.featured) || l?.[0])).catch(() => {}); }, []);
  return (<>
    <section className="hero">
      <div>
        <p className="eyebrow">Golf scores that give back</p>
        <h1>Your good rounds pay for someone else's <em>better days.</em></h1>
        <p className="lead">Subscribe, log your latest scores, and choose the charity that receives a share of every payment. Each month your scores enter a prize draw.</p>
        <div className="row cta"><Link to="/signup" className="btn big">Subscribe and pick your charity</Link><Link to="/charities" className="btn big ghost">Meet the charities</Link></div>
        <div className="balls" aria-label="Example draw numbers">
          {balls.map((n, i) => <motion.span key={n} initial={{ scale: 0, rotate: -80 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.4 + i * 0.12, type: 'spring', stiffness: 260, damping: 16 }}>{n}</motion.span>)}
        </div>
      </div>
      <motion.aside className="impact" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.6 }} aria-label="Where your subscription goes">
        <p className="eyebrow">Where your fee goes</p>
        <h2>Every payment does three jobs</h2>
        {split.map(([l, v, col], i) => <div key={l} className="bar"><div className="barh"><span>{l}</span><b>{v}%</b></div>
          <div className="track"><motion.i style={{ background: col }} initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ delay: 0.6 + i * 0.15, duration: 0.8, ease: 'easeOut' }} /></div></div>)}
        <small>Example at the 10% minimum. You can give more at any time.</small>
      </motion.aside>
    </section>

    <section className="facts"><div><b>1 to 45</b><span>Stableford score range</span></div><div><b>Monthly</b><span>prize draw, published by admin</span></div><div><b>10% +</b><span>always goes to your charity</span></div></section>

    <section className="band"><Reveal><p className="eyebrow">How it works</p><h2>Three steps, one purpose</h2></Reveal>
      <div className="grid three">{steps.map(([n, t, d], i) => <Reveal key={n} delay={i * 0.1}><div className="card step"><span className="num">{n}</span><h3>{t}</h3><p>{d}</p></div></Reveal>)}</div></section>

    <section className="band dark"><Reveal><p className="eyebrow">The prize pool</p><h2>Match more numbers, win a bigger share</h2></Reveal>
      <div className="tiers"><Reveal><strong>40%</strong><b>5 numbers</b><span>The jackpot. It rolls over to the next month if nobody wins.</span></Reveal>
        <Reveal delay={0.1}><strong>35%</strong><b>4 numbers</b><span>Split equally between all winners in this tier.</span></Reveal>
        <Reveal delay={0.2}><strong>25%</strong><b>3 numbers</b><span>Split equally between all winners in this tier.</span></Reveal></div></section>

    {c && <section className="band"><Reveal><p className="eyebrow">Featured charity</p></Reveal>
      <Reveal className="feature">{c.image_url ? <img src={c.image_url} alt={c.name} /> : <div className="ph" aria-hidden="true">{c.name[0]}</div>}
        <div><h2>{c.name}</h2><p className="lead">{c.description}</p><div className="row"><Link to={`/charities/${c.id}`} className="btn">Read their story</Link><Link to="/charities" className="btn ghost">See all charities</Link></div></div></Reveal></section>}

    <section className="band final"><Reveal><h2>Ready to play for something bigger?</h2><p className="lead">Join in a minute. Cancel any time from your dashboard.</p><Link to="/signup" className="btn big">Join Digital Heroes</Link></Reveal></section>
  </>);
}
