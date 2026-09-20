import { useState } from 'react';
import { api } from '../../api';
// Create or edit a charity, including its upcoming events
export default function CharityForm({ charity, onDone }) {
  const [f, setF] = useState({ name: charity?.name || '', description: charity?.description || '', image_url: charity?.image_url || '', featured: !!charity?.featured, events: charity?.events || [] });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const ev = (i, k) => e => setF({ ...f, events: f.events.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) });
  const save = async e => {
    e.preventDefault(); setErr('');
    if (!f.name.trim()) return setErr('Name is required');
    if (f.image_url && !/^https?:\/\//.test(f.image_url)) return setErr('Image must be a link starting with http');
    if (f.events.some(x => !x.title || !x.date)) return setErr('Each event needs a title and a date');
    setBusy(true);
    try { await api(charity ? `/admin/charities/${charity.id}` : '/admin/charities', charity ? 'PUT' : 'POST', f); onDone(); }
    catch (x) { setErr(x.message); setBusy(false); }
  };
  return (<form className="card" onSubmit={save}>
    <h2>{charity ? 'Edit charity' : 'Add charity'}</h2>
    <label>Name<input required value={f.name} onChange={set('name')} maxLength={120} /></label>
    <label>Description<textarea rows={4} value={f.description} onChange={set('description')} maxLength={2000} /></label>
    <label>Image link<input value={f.image_url} onChange={set('image_url')} placeholder="https://..." /></label>
    <label><input type="checkbox" checked={f.featured} onChange={set('featured')} style={{ width: 'auto' }} /> Feature on homepage</label>
    <h3>Upcoming events</h3>
    {f.events.map((x, i) => <div className="row" key={i}>
      <input placeholder="Title" value={x.title || ''} onChange={ev(i, 'title')} aria-label="Event title" />
      <input type="date" value={x.date || ''} onChange={ev(i, 'date')} aria-label="Event date" />
      <input placeholder="Description" value={x.description || ''} onChange={ev(i, 'description')} aria-label="Event description" />
      <button type="button" className="link" onClick={() => setF({ ...f, events: f.events.filter((_, j) => j !== i) })}>Remove</button></div>)}
    <button type="button" className="link" onClick={() => setF({ ...f, events: [...f.events, { title: '', date: '', description: '' }] })}>Add event</button>
    {err && <p className="err" role="alert">{err}</p>}
    <div className="row"><button className="btn sm" disabled={busy}>{busy ? 'Saving' : 'Save charity'}</button><button type="button" className="btn sm ghost" onClick={onDone}>Cancel</button></div>
  </form>);
}
