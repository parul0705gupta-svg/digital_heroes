import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
export default function Charities() {
  const [q, setQ] = useState(''), [list, setList] = useState([]), [flt, setFlt] = useState('all');
  useEffect(() => { const t = setTimeout(() => api(`/charities?q=${encodeURIComponent(q)}`).then(l => setList(Array.isArray(l) ? l : [])).catch(() => setList([])), 250); return () => clearTimeout(t); }, [q]);
  const shown = list.filter(c => flt === 'all' || (flt === 'featured' ? c.featured : (c.events || []).length > 0));
  return (<section className="page"><h1>Charities you can support</h1>
    <input placeholder="Search charities" value={q} onChange={e => setQ(e.target.value)} aria-label="Search charities" />
    <div className="row" role="group" aria-label="Filter charities">{[['all', 'All'], ['featured', 'Featured'], ['events', 'Upcoming events']].map(([k, l]) =>
      <button key={k} className={`btn sm ${flt === k ? '' : 'ghost'}`} aria-pressed={flt === k} onClick={() => setFlt(k)}>{l}</button>)}</div>
    <div className="grid">{shown.map(c => <article key={c.id} className="card">
      {c.image_url && <img src={c.image_url} alt="" />}<h3><Link to={`/charities/${c.id}`}>{c.name}</Link></h3><p>{c.description}</p>
      {(c.events || []).map((e, i) => <small key={i}>Upcoming: {e.title} on {e.date}</small>)}</article>)}
      {!shown.length && <p>No charities match that search. Try a shorter name.</p>}</div></section>);
}
