import { useEffect, useState } from 'react';
import { api } from '../api';
import UserEditor from './admin/UserEditor'; import CharityForm from './admin/CharityForm';
const subOf = u => (Array.isArray(u.subscriptions) ? u.subscriptions[0] : u.subscriptions) || {};
const arr = x => (Array.isArray(x) ? x : []);
const tabs = ['Users', 'Draws', 'Charities', 'Winners', 'Reports'];
export default function Admin() {
  const [t, setT] = useState('Users'), [editId, setEditId] = useState(null), [cf, setCf] = useState(undefined), [del, setDel] = useState(null), [rows, setRows] = useState([]), [rep, setRep] = useState(null), [msg, setMsg] = useState('');
  const [draw, setDraw] = useState(null), [dr, setDr] = useState({ month: new Date().toISOString().slice(0, 7), mode: 'random' }), [nc, setNc] = useState({ name: '', description: '', image_url: '' });
  const run = async fn => { setMsg(''); try { await fn(); } catch (e) { setMsg(e.message); } };
  const setStatus = (w, body) => run(async () => { await api(`/admin/winners/${w.id}`, 'PATCH', body); load(); });
  const load = () => run(async () => {
    if (t === 'Users') setRows(arr(await api('/admin/users'))); if (t === 'Winners') setRows(arr(await api('/admin/winners')));
    if (t === 'Charities') setRows(arr(await api('/charities'))); if (t === 'Reports') setRep(await api('/admin/reports')); });
  useEffect(() => { load(); }, [t]);
  return (<section className="page"><h1>Admin</h1>
    <div className="tabs">{tabs.map(x => <button key={x} className={x === t ? 'on' : ''} onClick={() => { setT(x); setEditId(null); setCf(undefined); }}>{x}</button>)}</div>
    {msg && <p className="err" role="alert">{msg}</p>}
    {t === 'Users' && (editId ? <UserEditor id={editId} onClose={() => { setEditId(null); load(); }} /> :
      <div className="scroll"><table className="tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Subscription</th><th>Plan</th><th>Charity</th><th></th></tr></thead>
        <tbody>{rows.map(u => <tr key={u.id}><td>{u.full_name || '-'}</td><td>{u.email}</td><td>{u.role}</td><td>{subOf(u).status || 'none'}</td><td>{subOf(u).plan || '-'}</td><td>{u.charities?.name || '-'}</td>
          <td><button className="link" onClick={() => setEditId(u.id)}>View / edit</button></td></tr>)}</tbody></table>
        {!rows.length && <p>No users yet.</p>}</div>)}
    {t === 'Draws' && <div className="card"><div className="row"><input type="month" value={dr.month} onChange={e => setDr({ ...dr, month: e.target.value })} />
      <select value={dr.mode} onChange={e => setDr({ ...dr, mode: e.target.value })}><option value="random">Random</option><option value="algorithmic">Algorithmic (score frequency)</option></select>
      <button className="btn sm" onClick={() => run(async () => setDraw(await api('/admin/draws/simulate', 'POST', dr)))}>Run simulation</button></div>
      {draw && <div><div className="balls sm">{draw.numbers.map(n => <span key={n}>{n}</span>)}</div>
        <p>Pool ₹{Math.round(draw.pool.total)}. Winners: 5 numbers {draw.pool.winnerCounts[5]}, 4 numbers {draw.pool.winnerCounts[4]}, 3 numbers {draw.pool.winnerCounts[3]}. Jackpot carry ₹{Math.round(draw.jackpot_carry)}.</p>
        <button className="btn" disabled={draw.status === 'published'} onClick={() => run(async () => { await api(`/admin/draws/${draw.id}/publish`, 'POST'); setDraw({ ...draw, status: 'published' }); })}>{draw.status === 'published' ? 'Published' : 'Publish results'}</button></div>}</div>}
    {t === 'Charities' && (cf !== undefined ? <CharityForm charity={cf} onDone={() => { setCf(undefined); load(); }} /> : <>
      <button className="btn sm" onClick={() => setCf(null)}>Add charity</button>
      <ul className="list">{rows.map(c => <li key={c.id}><b>{c.name}</b>{c.featured && <span className="ok">Featured</span>}
        <button className="link" onClick={() => setCf(c)}>Edit</button>
        {del === c.id ? <><span>Delete this charity?</span><button className="link" onClick={() => run(async () => { await api(`/admin/charities/${c.id}`, 'DELETE'); setDel(null); load(); })}>Yes, delete</button><button className="link" onClick={() => setDel(null)}>Keep</button></>
          : <button className="link" onClick={() => setDel(c.id)}>Delete</button>}</li>)}
        {!rows.length && <li>No charities yet. Add the first one.</li>}</ul></>)}
    {t === 'Winners' && <ul className="list">{rows.map(w => <li key={w.id}><div><b>{w.profiles?.full_name || w.profiles?.email}</b> <span>{w.profiles?.email}</span><br />
      <span>{w.draws?.month}: {w.tier} numbers, ₹{w.amount}. Proof: {w.verification}. Payout: {w.payment}</span></div>
      {w.proof_signed && <a href={w.proof_signed} target="_blank" rel="noreferrer"><img src={w.proof_signed} alt="Proof screenshot" style={{ maxWidth: 140, borderRadius: 8 }} /></a>}
      {w.verification === 'submitted' && <><button className="link" onClick={() => setStatus(w, { verification: 'approved' })}>Approve</button><button className="link" onClick={() => setStatus(w, { verification: 'rejected' })}>Reject</button></>}
      {w.verification === 'rejected' && <button className="link" onClick={() => setStatus(w, { verification: 'awaiting' })}>Request resubmission</button>}
      {w.verification === 'approved' && w.payment === 'pending' && <button className="link" onClick={() => setStatus(w, { payment: 'paid' })}>Mark paid</button>}</li>)}
      {!rows.length && <li>No winners yet. Publish a draw first.</li>}</ul>}
    {t === 'Reports' && rep && <><div className="grid two"><div className="card"><h3>Total users</h3><p className="price">{rep.totalUsers}</p></div><div className="card"><h3>Monthly prize pool</h3><p className="price">₹{Math.round(rep.monthlyPrizePool)}</p></div>
      <div className="card"><h3>Charity donations</h3><p className="price">₹{rep.donations}</p></div><div className="card"><h3>Draws run</h3><p className="price">{rep.draws.length}</p></div>
      <div className="card"><h3>Active subscribers</h3><p className="price">{rep.activeSubscribers}</p></div><div className="card"><h3>Charity contributions / month</h3><p className="price">₹{Math.round(rep.charityContributions)}</p></div>
      <div className="card"><h3>Winners</h3><p className="price">{rep.winnersCount}</p></div><div className="card"><h3>Total payouts</h3><p className="price">₹{rep.totalPayouts}</p></div>
      <div className="card"><h3>Jackpot rollover</h3><p className="price">₹{Math.round(rep.jackpotRollover)}</p></div></div>
      <h3>Draw statistics</h3><div className="scroll"><table className="tbl"><thead><tr><th>Month</th><th>Participants</th><th>Pool</th><th>5 match</th><th>4 match</th><th>3 match</th><th>Rollover</th></tr></thead>
        <tbody>{rep.draws.map((x, i) => <tr key={i}><td>{x.month}</td><td>{x.pool?.participants ?? '-'}</td><td>₹{Math.round(x.pool?.total || 0)}</td><td>{x.pool?.winnerCounts?.[5]}</td><td>{x.pool?.winnerCounts?.[4]}</td><td>{x.pool?.winnerCounts?.[3]}</td><td>₹{Math.round(x.jackpot_carry)}</td></tr>)}</tbody></table>
        {!rep.draws.length && <p>No published draws yet.</p>}</div></>}
  </section>);
}
