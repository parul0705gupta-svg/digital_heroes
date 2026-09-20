import { useEffect, useState } from 'react';
import { api } from '../api';
const arr = x => (Array.isArray(x) ? x : []);
const tabs = ['Users', 'Draws', 'Charities', 'Winners', 'Reports'];
export default function Admin() {
  const [t, setT] = useState('Users'), [rows, setRows] = useState([]), [rep, setRep] = useState(null), [msg, setMsg] = useState('');
  const [draw, setDraw] = useState(null), [dr, setDr] = useState({ month: new Date().toISOString().slice(0, 7), mode: 'random' }), [nc, setNc] = useState({ name: '', description: '', image_url: '' });
  const run = async fn => { setMsg(''); try { await fn(); } catch (e) { setMsg(e.message); } };
  const load = () => run(async () => {
    if (t === 'Users') setRows(arr(await api('/admin/users'))); if (t === 'Winners') setRows(arr(await api('/admin/winners')));
    if (t === 'Charities') setRows(arr(await api('/charities'))); if (t === 'Reports') setRep(await api('/admin/reports')); });
  useEffect(() => { load(); }, [t]);
  return (<section className="page"><h1>Admin</h1>
    <div className="tabs">{tabs.map(x => <button key={x} className={x === t ? 'on' : ''} onClick={() => setT(x)}>{x}</button>)}</div>
    {msg && <p className="err" role="alert">{msg}</p>}
    {t === 'Users' && <ul className="list">{rows.map(u => <li key={u.id}><b>{u.full_name || u.email}</b> <span>{u.email}</span> <span>{u.subscriptions?.status || 'no subscription'} / {u.role}</span></li>)}</ul>}
    {t === 'Draws' && <div className="card"><div className="row"><input type="month" value={dr.month} onChange={e => setDr({ ...dr, month: e.target.value })} />
      <select value={dr.mode} onChange={e => setDr({ ...dr, mode: e.target.value })}><option value="random">Random</option><option value="algorithmic">Algorithmic (score frequency)</option></select>
      <button className="btn sm" onClick={() => run(async () => setDraw(await api('/admin/draws/simulate', 'POST', dr)))}>Run simulation</button></div>
      {draw && <div><div className="balls sm">{draw.numbers.map(n => <span key={n}>{n}</span>)}</div>
        <p>Pool ₹{Math.round(draw.pool.total)}. Winners: 5 numbers {draw.pool.winnerCounts[5]}, 4 numbers {draw.pool.winnerCounts[4]}, 3 numbers {draw.pool.winnerCounts[3]}. Jackpot carry ₹{Math.round(draw.jackpot_carry)}.</p>
        <button className="btn" disabled={draw.status === 'published'} onClick={() => run(async () => { await api(`/admin/draws/${draw.id}/publish`, 'POST'); setDraw({ ...draw, status: 'published' }); })}>{draw.status === 'published' ? 'Published' : 'Publish results'}</button></div>}</div>}
    {t === 'Charities' && <><form className="row" onSubmit={e => { e.preventDefault(); run(async () => { await api('/admin/charities', 'POST', nc); setNc({ name: '', description: '', image_url: '' }); load(); }); }}>
      <input required placeholder="Name" value={nc.name} onChange={e => setNc({ ...nc, name: e.target.value })} /><input placeholder="Description" value={nc.description} onChange={e => setNc({ ...nc, description: e.target.value })} />
      <input placeholder="Image URL" value={nc.image_url} onChange={e => setNc({ ...nc, image_url: e.target.value })} /><button className="btn sm">Add charity</button></form>
      <ul className="list">{rows.map(c => <li key={c.id}><b>{c.name}</b>
        <button className="link" onClick={() => run(async () => { await api(`/admin/charities/${c.id}`, 'PUT', { featured: !c.featured }); load(); })}>{c.featured ? 'Unfeature' : 'Feature'}</button>
        <button className="link" onClick={() => run(async () => { await api(`/admin/charities/${c.id}`, 'DELETE'); load(); })}>Delete</button></li>)}</ul></>}
    {t === 'Winners' && <ul className="list">{rows.map(w => <li key={w.id}><b>{w.profiles?.full_name || w.profiles?.email}</b> <span>{w.draws?.month}: {w.tier} numbers, ₹{w.amount}</span> <span>{w.verification} / {w.payment}</span>
      {w.proof_url && <a href={w.proof_url} target="_blank" rel="noreferrer">View proof</a>}
      {['approved', 'rejected'].map(v => <button key={v} className="link" onClick={() => run(async () => { await api(`/admin/winners/${w.id}`, 'PATCH', { verification: v }); load(); })}>{v === 'approved' ? 'Approve' : 'Reject'}</button>)}
      {w.verification === 'approved' && w.payment === 'pending' && <button className="link" onClick={() => run(async () => { await api(`/admin/winners/${w.id}`, 'PATCH', { payment: 'paid' }); load(); })}>Mark paid</button>}</li>)}</ul>}
    {t === 'Reports' && rep && <div className="grid two"><div className="card"><h3>Total users</h3><p className="price">{rep.totalUsers}</p></div><div className="card"><h3>Monthly prize pool</h3><p className="price">₹{Math.round(rep.monthlyPrizePool)}</p></div>
      <div className="card"><h3>Charity donations</h3><p className="price">₹{rep.donations}</p></div><div className="card"><h3>Draws run</h3><p className="price">{rep.draws.length}</p></div></div>}
  </section>);
}
