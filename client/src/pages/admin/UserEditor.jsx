import { useEffect, useState } from 'react';
import { api } from '../../api';
// View and edit one user: profile, subscription status and golf scores
export default function UserEditor({ id, onClose }) {
  const [u, setU] = useState(null), [msg, setMsg] = useState({ t: '', ok: false }), [busy, setBusy] = useState(false), [edit, setEdit] = useState({});
  const say = (t, ok = false) => setMsg({ t, ok });
  const load = () => api(`/admin/users/${id}`).then(setU).catch(e => say(e.message));
  useEffect(() => { load(); }, [id]);
  const run = async (fn, done) => { setBusy(true); say(''); try { await fn(); await load(); say(done, true); } catch (e) { say(e.message); } setBusy(false); };
  if (!u) return <p className={msg.t ? 'err' : ''}>{msg.t || 'Loading user'}</p>;
  const sub = Array.isArray(u.subscriptions) ? u.subscriptions[0] : u.subscriptions;
  const save = e => { e.preventDefault(); const f = new FormData(e.target);
    run(() => api(`/admin/users/${id}`, 'PATCH', { full_name: f.get('name'), role: f.get('role'), charity_pct: +f.get('pct') }), 'Profile saved'); };
  return (<div className="card"><button className="link" onClick={onClose}>Back to users</button>
    <h2>{u.full_name || u.email}</h2><p>{u.email}</p>
    <form className="row" onSubmit={save}>
      <label>Full name<input name="name" defaultValue={u.full_name || ''} maxLength={100} /></label>
      <label>Role<select name="role" defaultValue={u.role}><option value="subscriber">Subscriber</option><option value="admin">Admin</option></select></label>
      <label>Charity %<input name="pct" type="number" min="10" max="100" defaultValue={u.charity_pct} required /></label>
      <button className="btn sm" disabled={busy}>Save profile</button></form>
    <p>Selected charity: {u.charities?.name || 'None'}</p>
    <h3>Subscription</h3>
    {sub ? <><p>Plan: {sub.plan}. Renewal: {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : 'not set'}.</p>
      <select value={sub.status} disabled={busy} aria-label="Subscription status" onChange={e => run(() => api(`/admin/users/${id}/subscription`, 'PATCH', { status: e.target.value }), 'Subscription updated')}>
        {['active', 'inactive', 'cancelled', 'lapsed'].map(x => <option key={x}>{x}</option>)}</select>
      <small>A manual change is replaced the next time Stripe sends an update.</small></> : <p>No subscription yet.</p>}
    <h3>Scores</h3>
    <ul className="list">{u.scores.map(s => <li key={s.id}><span>{s.played_on}</span>
      <input type="number" min="1" max="45" style={{ width: 90 }} aria-label={`Score on ${s.played_on}`} value={edit[s.id] ?? s.score} onChange={e => setEdit({ ...edit, [s.id]: e.target.value })} />
      <button className="link" disabled={busy} onClick={() => run(() => api(`/admin/users/${id}/scores/${s.id}`, 'PUT', { score: +(edit[s.id] ?? s.score) }), 'Score saved')}>Save</button>
      <button className="link" disabled={busy} onClick={() => run(() => api(`/admin/users/${id}/scores/${s.id}`, 'DELETE'), 'Score deleted')}>Delete</button></li>)}
      {!u.scores.length && <li>No scores yet.</li>}</ul>
    {msg.t && <p className={msg.ok ? 'ok' : 'err'} role="status">{msg.t}</p>}</div>);
}
