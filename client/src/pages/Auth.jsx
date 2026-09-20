import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sb, api } from '../api';
export default function Auth({ mode }) {
  const [f, setF] = useState({ email: '', password: '', full_name: '', charity_id: '' }), [err, setErr] = useState(''), [ch, setCh] = useState([]), nav = useNavigate();
  useEffect(() => { if (mode === 'signup') api('/charities').then(l => setCh(Array.isArray(l) ? l : [])).catch(() => {}); }, [mode]);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault(); setErr('');
    try {
      if (mode === 'signup') { if (!f.charity_id) throw new Error('Choose a charity to continue'); await api('/signup', 'POST', f); }
      const { error } = await sb.auth.signInWithPassword({ email: f.email, password: f.password });
      if (error) throw error;
      nav(mode === 'signup' ? '/pricing' : '/dashboard');
    } catch (x) { setErr(x.message); }
  };
  return (<section className="page narrow"><h1>{mode === 'signup' ? 'Create your account' : 'Log in'}</h1>
    <form onSubmit={submit}>
      {mode === 'signup' && <input required placeholder="Full name" value={f.full_name} onChange={set('full_name')} />}
      <input required type="email" placeholder="Email" value={f.email} onChange={set('email')} />
      <input required type="password" minLength={6} placeholder="Password (6+ characters)" value={f.password} onChange={set('password')} />
      {mode === 'signup' && <select value={f.charity_id} onChange={set('charity_id')}><option value="">Choose your charity</option>{ch.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn">{mode === 'signup' ? 'Create account' : 'Log in'}</button></form></section>);
}
