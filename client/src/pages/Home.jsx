import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../api';

const balls = [7, 19, 24, 33, 41];
export default function Home() {
  const [c, setC] = useState(null);
  useEffect(() => { api('/charities').then(l => setC((Array.isArray(l) ? l : []).find(x => x.featured) || l?.[0])).catch(() => {}); }, []);
  return (<>
    <section className="hero">
      <h1>Your good rounds pay for someone else's better days.</h1>
      <p>Subscribe, log your last five Stableford scores, and choose the charity that receives a share of your fee. Every month, your scores enter a prize draw.</p>
      <div className="balls" aria-label="Example draw numbers">
        {balls.map((n, i) => <motion.span key={n} initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.3 + i * 0.15, type: 'spring' }}>{n}</motion.span>)}
      </div>
      <Link to="/signup" className="btn big">Subscribe and pick your charity</Link>
    </section>
    <section className="band"><h2>How it works</h2>
      <ol className="steps">
        <li><b>Subscribe.</b> Monthly, or yearly at a discount. At least 10% of your fee goes to your charity.</li>
        <li><b>Enter your scores.</b> Your latest five, each between 1 and 45. A new score replaces your oldest.</li>
        <li><b>Match the draw.</b> Each month five numbers are drawn. Match 3, 4 or 5 of them to win.</li></ol></section>
    <section className="band alt"><h2>Where the prize pool goes</h2>
      <div className="tiers"><div><strong>40%</strong><span>5 numbers. Jackpot that rolls over if nobody wins.</span></div>
        <div><strong>35%</strong><span>4 numbers, split between winners.</span></div><div><strong>25%</strong><span>3 numbers, split between winners.</span></div></div></section>
    {c && <section className="band"><h2>Featured charity</h2><div className="feature">
      {c.image_url && <img src={c.image_url} alt={c.name} />}<div><h3>{c.name}</h3><p>{c.description}</p><Link to="/charities" className="btn ghost">See all charities</Link></div></div></section>}
  </>);
}
