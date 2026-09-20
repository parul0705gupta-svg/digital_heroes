import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
export default function Dashboard() {
  const [d, setD] = useState(null), [ch, setCh] = useState([]), [err, setErr] = useState(''), [f, setF] = useState({ score: '', played_on: '' });
  const load = () => api('/dashboard').then(setD).catch(e => setErr(e.message));
  useEffect(() => { load(); api('/charities').then(setCh); }, []);
  const act = async fn => { setErr(''); try { await fn(); await load(); } catch (e) { setErr(e.message); } };
  if (!d) return <section className="page"><p>{err || 'Loading your dashboard'}</p></section>;
  const sub = d.subscription, active = sub?.status === 'active';
  return (<section className="page"><h1>Your dashboard</h1>{err && <p className="err" role="alert">{err}</p>}
    <div className="grid two">
      <div className="card"><h3>Subscription</h3><p className={active ? 'ok' : 'err'}>{active ? 'Active' : 'Inactive'}{sub?.plan && ` (${sub.plan})`}</p>
        {sub?.current_period_end && <small>Renews {new Date(sub.current_period_end).toLocaleDateString()}</small>}
        {!active && <Link to="/pricing" className="btn sm">Subscribe to enter draws</Link>}</div>
      <div className="card"><h3>Your charity</h3>
        <select value={d.charity?.id || ''} onChange={e => act(() => api('/me/charity', 'PATCH', { charity_id: e.target.value, charity_pct: d.charity_pct }))}>
          <option value="">Choose a charity</option>{ch.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <label>Contribution: {d.charity_pct}%<input type="range" min="10" max="100" value={d.charity_pct} onChange={e => setD({ ...d, charity_pct: +e.target.value })}
          onMouseUp={() => act(() => api('/me/charity', 'PATCH', { charity_id: d.charity?.id, charity_pct: d.charity_pct }))} onTouchEnd={() => act(() => api('/me/charity', 'PATCH', { charity_id: d.charity?.id, charity_pct: d.charity_pct }))} /></label></div>
      <div className="card"><h3>Your last 5 scores</h3>
        <form className="row" onSubmit={e => { e.preventDefault(); act(async () => { await api('/scores', 'POST', { score: +f.score, played_on: f.played_on }); setF({ score: '', played_on: '' }); }); }}>
          <input required type="number" min="1" max="45" placeholder="Score (1-45)" value={f.score} onChange={e => setF({ ...f, score: e.target.value })} />
          <input required type="date" value={f.played_on} onChange={e => setF({ ...f, played_on: e.target.value })} /><button className="btn sm">Add score</button></form>
        <ul className="list">{d.scores.map(s => <li key={s.id}><b>{s.score}</b> <span>{s.played_on}</span>
          <button className="link" onClick={() => { const v = +prompt('New score (1-45)', s.score); if (v) act(() => api(`/scores/${s.id}`, 'PUT', { score: v })); }}>Edit</button>
          <button className="link" onClick={() => act(() => api(`/scores/${s.id}`, 'DELETE'))}>Delete</button></li>)}
          {!d.scores.length && <li>No scores yet. Add your first round above.</li>}</ul></div>
      <div className="card"><h3>Draws</h3><p>{d.drawsEntered} published so far. The next draw runs at the end of the month.</p>
        <h3>Winnings</h3><p className="price">₹{d.totalWon}<small> approved</small></p>
        <ul className="list">{d.winnings.map(w => <li key={w.id}>{w.draws?.month}: {w.tier} numbers, ₹{w.amount} ({w.verification}, {w.payment})
          {w.verification === 'awaiting' && <button className="link" onClick={() => { const u = prompt('Link to your score screenshot'); if (u) act(() => api(`/winners/${w.id}/proof`, 'POST', { proof_url: u })); }}>Upload proof</button>}</li>)}
          {!d.winnings.length && <li>No wins yet.</li>}</ul></div>
    </div></section>);
}
