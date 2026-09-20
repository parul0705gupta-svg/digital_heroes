import { useEffect, useState } from 'react';
import { api } from '../api';
export default function Charities() {
  const [q, setQ] = useState(''), [list, setList] = useState([]);
  useEffect(() => { const t = setTimeout(() => api(`/charities?q=${encodeURIComponent(q)}`).then(setList).catch(() => setList([])), 250); return () => clearTimeout(t); }, [q]);
  return (<section className="page"><h1>Charities you can support</h1>
    <input placeholder="Search charities" value={q} onChange={e => setQ(e.target.value)} aria-label="Search charities" />
    <div className="grid">{list.map(c => <article key={c.id} className="card">
      {c.image_url && <img src={c.image_url} alt="" />}<h3>{c.name}</h3><p>{c.description}</p>
      {(c.events || []).map((e, i) => <small key={i}>Upcoming: {e.title} on {e.date}</small>)}</article>)}
      {!list.length && <p>No charities match that search. Try a shorter name.</p>}</div></section>);
}
