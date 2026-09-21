import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sb, api } from '../api';

// One page for both flows: /login and /signup share a tab switch
export default function Auth({ mode }) {
  const signup = mode === 'signup';
  const [f, setF] = useState({ email: '', password: '', confirm: '', full_name: '', charity_id: '' });
  const [err, setErr] = useState(''), [ch, setCh] = useState([]), [show, setShow] = useState(false), [busy, setBusy] = useState(false), nav = useNavigate();
  useEffect(() => {
    setErr('');
    if (signup) api('/charities').then(l => setCh(Array.isArray(l) ? l : [])).catch(() => setErr('Could not load the charities. Refresh the page and try again.'));
  }, [signup]);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault(); setErr('');
    if (signup) {
      if (f.password !== f.confirm) return setErr('The two passwords do not match.');
      if (!f.charity_id) return setErr('Choose a charity to continue.');
    }
    setBusy(true);
    try {
      if (signup) await api('/signup', 'POST', { email: f.email, password: f.password, full_name: f.full_name, charity_id: f.charity_id });
      const { error } = await sb.auth.signInWithPassword({ email: f.email, password: f.password });
      if (error) throw new Error(signup ? 'Your account was created, but sign-in failed. Please log in.' : 'Incorrect email or password.');
      nav(signup ? '/pricing' : '/dashboard');
    } catch (x) { setErr(x.message); setBusy(false); }
  };
  return (<section className="auth">
    <div>
      <p className="eyebrow">{signup ? 'Create your account' : 'Welcome back'}</p>
      <h1>{signup ? <>Join a community that <em>plays for good.</em></> : <>Good to <em>see you again.</em></>}</h1>
      <ul><li>Your subscription funds the charity you choose</li><li>Log your latest five scores in seconds</li><li>Enter the monthly prize draw automatically</li></ul>
    </div>
    <div className="authcard">
      <nav className="switch" aria-label="Account"><Link to="/login" className={signup ? '' : 'on'}>Log in</Link><Link to="/signup" className={signup ? 'on' : ''}>Sign up</Link></nav>
      <form onSubmit={submit}>
        {signup && <><label htmlFor="name">Full name</label><input id="name" required autoComplete="name" value={f.full_name} onChange={set('full_name')} /></>}
        <label htmlFor="email">Email</label><input id="email" required type="email" autoComplete="email" value={f.email} onChange={set('email')} />
        <label htmlFor="pw">Password</label>
        <div className="pw"><input id="pw" required minLength={6} type={show ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} value={f.password} onChange={set('password')} />
          <button type="button" className="link" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button></div>
        {signup && <>
          <label htmlFor="pw2">Confirm password</label><input id="pw2" required minLength={6} type={show ? 'text' : 'password'} autoComplete="new-password" value={f.confirm} onChange={set('confirm')} />
          <label htmlFor="charity">Your charity</label>
          <select id="charity" required value={f.charity_id} onChange={set('charity_id')}><option value="">Choose a charity</option>{ch.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <small>At least 10% of your subscription goes to this charity. You can change it later.</small></>}
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn big" style={{ width: '100%', marginTop: '1rem' }} disabled={busy}>{busy ? 'Please wait' : signup ? 'Create account' : 'Log in'}</button>
      </form>
      <small style={{ marginTop: '1rem', textAlign: 'center' }}>{signup ? <>Already have an account? <Link to="/login" className="link">Log in</Link></> : <>New here? <Link to="/signup" className="link">Create an account</Link></>}</small>
    </div></section>);
}
