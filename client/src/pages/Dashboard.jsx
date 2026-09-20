import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
export default function Dashboard() {
  const [ed, setEd] = useState(null), [d, setD] = useState(null), [ch, setCh] = useState([]), [err, setErr] = useState(''), [f, setF] = useState({ score: '', played_on: '' });
  const load = () => api('/dashboard').then(setD).catch(e => setErr(e.message));
  useEffect(() => { load(); api('/charities').then(l => setCh(Array.isArray(l) ? l : [])); }, []);
  const act = async fn => { setErr(''); try { await fn(); await load(); } catch (e) { setErr(e.message); } };
  const portal = () => act(async () => { const { url } = await api('/billing-portal', 'POST'); location.href = url; });
  if (!d) return <section className="page"><p>{err || 'Loading your dashboard'}</p></section>;
  const sub = d.subscription, active = sub?.status === 'active';
  return (<section className="page"><h1>Your dashboard</h1>{err && <p className="err" role="alert">{err}</p>}
    <div className="grid two">
      <div className="card"><h3>Subscription</h3><p className={active ? 'ok' : 'err'}>{active ? 'Active' : 'Inactive'}{sub?.plan && ` (${sub.plan})`}</p>
        {sub?.current_period_end && <small>Renews {new Date(sub.current_period_end).toLocaleDateString()}</small>}
        {sub?.cancel_at_period_end && active && <small>Cancels at the end of this period</small>}
        {!active && <Link to="/pricing" className="btn sm">Subscribe to enter draws</Link>}
        {sub?.stripe_sub_id && <div className="row"><button className="btn sm ghost" onClick={portal}>Manage subscription</button><button className="btn sm ghost" onClick={portal}>Cancel subscription</button></div>}</div>
      <div className="card"><h3>Your charity</h3>
        <select value={d.charity?.id || ''} onChange={e => act(() => api('/me/charity', 'PATCH', { charity_id: e.target.value, charity_pct: d.charity_pct }))}>
          <option value="">Choose a charity</option>{ch.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <label>Contribution: {d.charity_pct}%<input type="range" min="10" max="100" value={d.charity_pct} onChange={e => setD({ ...d, charity_pct: +e.target.value })}
          onMouseUp={() => act(() => api('/me/charity', 'PATCH', { charity_id: d.charity?.id, charity_pct: d.charity_pct }))} onTouchEnd={() => act(() => api('/me/charity', 'PATCH', { charity_id: d.charity?.id, charity_pct: d.charity_pct }))} /></label></div>
      <div className="card"><h3>Your last 5 scores</h3>
        <form className="row" onSubmit={e => { e.preventDefault(); act(async () => { await api('/scores', 'POST', { score: +f.score, played_on: f.played_on }); setF({ score: '', played_on: '' }); }); }}>
          <input required type="number" min="1" max="45" placeholder="Score (1-45)" value={f.score} onChange={e => setF({ ...f, score: e.target.value })} />
          <input required type="date" value={f.played_on} onChange={e => setF({ ...f, played_on: e.target.value })} /><button className="btn sm">Add score</button></form>
        <ul className="list">{d.scores.map(s => <li key={s.id}>{ed?.id === s.id ? <><input type="number" min="1" max="45" style={{ width: 90 }} value={ed.v} aria-label="New score" onChange={e => setEd({ id: s.id, v: e.target.value })} />
          <button className="link" onClick={() => act(async () => { await api(`/scores/${s.id}`, 'PUT', { score: +ed.v }); setEd(null); })}>Save</button><button className="link" onClick={() => setEd(null)}>Cancel</button></>
          : <><b>{s.score}</b> <span>{s.played_on}</span><button className="link" onClick={() => setEd({ id: s.id, v: s.score })}>Edit</button><button className="link" onClick={() => act(() => api(`/scores/${s.id}`, 'DELETE'))}>Delete</button></>}</li>)}
          {!d.scores.length && <li>No scores yet. Add your first round above.</li>}</ul></div>
      <div className="card"><h3>Draws</h3><p>Next draw: {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toLocaleDateString()} (end of this month). {d.drawsEntered} published so far.</p>
        <ul className="list">{(d.pastDraws || []).map(x => { const w = d.winnings.find(v => v.draw_id === x.id); return <li key={x.id}><b>{x.month}</b> <span>{x.numbers.join(', ')}</span> <span>{w ? `You won (${w.tier} numbers)` : 'No win'}</span></li>; })}</ul>
        <h3>Winnings</h3><p className="price">₹{d.totalWon}<small> approved</small></p>
        <ul className="list">{d.winnings.map(w => <li key={w.id}>{w.draws?.month}: {w.tier} numbers, ₹{w.amount} ({w.verification}, {w.payment})
          {['awaiting', 'rejected'].includes(w.verification) && <ProofUpload id={w.id} onDone={load} />}</li>)}
          {!d.winnings.length && <li>No wins yet.</li>}</ul></div>
    </div></section>);
}

// Validates, previews and uploads a winner proof screenshot (server stores it in private Supabase Storage)
function ProofUpload({ id, onDone }) {
  const [file, setFile] = useState(null), [busy, setBusy] = useState(false), [msg, setMsg] = useState('');
  const preview = useMemo(() => file && URL.createObjectURL(file), [file]);
  const pick = e => {
    const f = e.target.files[0]; setMsg(''); if (!f) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) return setMsg('Use a PNG, JPG or WebP image');
    if (f.size > 3 * 1024 * 1024) return setMsg('Image must be under 3 MB');
    setFile(f);
  };
  const send = async () => {
    setBusy(true); setMsg('');
    try {
      const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.onerror = no; r.readAsDataURL(file); });
      await api(`/winners/${id}/proof`, 'POST', { type: file.type, data }); setFile(null); onDone();
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  return (<div className="proof"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={pick} aria-label="Screenshot of your scores" />
    {preview && <img src={preview} alt="Preview of your proof" style={{ maxWidth: 160, borderRadius: 8 }} />}
    {file && <button className="btn sm" disabled={busy} onClick={send}>{busy ? 'Uploading...' : 'Submit proof'}</button>}
    {msg && <p className="err" role="alert">{msg}</p>}</div>);
}
