import { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { api } from '../api';
export default function CharityDetail() {
  const { id } = useParams(), donated = new URLSearchParams(useLocation().search).get('donated');
  const [c, setC] = useState(null), [amt, setAmt] = useState(500), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { api(`/charities/${id}`).then(setC).catch(e => setErr(e.message)); }, [id]);
  const donate = async e => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const { url } = await api('/donate', 'POST', { charity_id: id, amount: +amt }); location.href = url; }
    catch (x) { setErr(x.message === 'Unauthenticated' ? 'Please log in to donate.' : x.message); setBusy(false); }
  };
  if (!c) return <section className="page"><p className={err ? 'err' : ''}>{err || 'Loading'}</p></section>;
  return (<section className="page"><Link to="/charities" className="link">Back to charities</Link>
    {donated && <p className="ok" role="status">Thank you. Your donation is being confirmed.</p>}
    <div className="feature">{c.image_url && <img src={c.image_url} alt={c.name} />}
      <div><h1>{c.name}</h1><p>{c.description}</p>
        <form className="row" onSubmit={donate}><label>Donate independently (₹)<input type="number" min="50" max="100000" required value={amt} onChange={e => setAmt(e.target.value)} /></label>
          <button className="btn" disabled={busy}>{busy ? 'Redirecting' : 'Donate'}</button></form>
        <small>Donations are separate from your subscription and do not affect draws.</small>
        {err && <p className="err" role="alert">{err}</p>}</div></div>
    <h2>Upcoming events</h2>
    {(c.events || []).length ? <ul className="list">{c.events.map((e, i) => <li key={i}><b>{e.title}</b> <span>{e.date}</span> <span>{e.description}</span></li>)}</ul> : <p>No events scheduled yet.</p>}
  </section>);
}
