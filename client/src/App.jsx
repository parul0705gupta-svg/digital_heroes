import { useEffect, useState } from 'react';
import { Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import { sb, api } from './api';
import Home from './pages/Home'; import Charities from './pages/Charities'; import Pricing from './pages/Pricing';
import CharityDetail from './pages/CharityDetail';
import Auth from './pages/Auth'; import Dashboard from './pages/Dashboard'; import Admin from './pages/Admin';

export default function App() {
  const [me, setMe] = useState(null); const nav = useNavigate();
  const load = () => sb.auth.getSession().then(({ data }) => data.session ? api('/me').then(setMe).catch(() => setMe(null)) : setMe(null));
  useEffect(() => { load(); const { data } = sb.auth.onAuthStateChange(() => load()); return () => data.subscription.unsubscribe(); }, []);
  const out = async () => { await sb.auth.signOut(); nav('/'); };
  return (<>
    <header className="nav"><Link to="/" className="logo">digital<b>heroes</b></Link>
      <nav>
        <Link to="/charities">Charities</Link><Link to="/pricing">Pricing</Link>
        {me && <Link to="/dashboard">Dashboard</Link>}
        {me?.role === 'admin' && <Link to="/admin">Admin</Link>}
        {me ? <button className="link" onClick={out}>Log out</button> : <Link to="/login">Log in</Link>}
        {!me && <Link to="/signup" className="btn sm">Join now</Link>}
      </nav></header>
    <main>
      <Routes>
        <Route path="/" element={<Home />} /><Route path="/charities" element={<Charities />} /><Route path="/charities/:id" element={<CharityDetail />} /><Route path="/pricing" element={<Pricing me={me} />} />
        <Route path="/login" element={<Auth mode="login" />} /><Route path="/signup" element={<Auth mode="signup" />} />
        <Route path="/dashboard" element={me ? <Dashboard /> : <Navigate to="/login" />} />
        <Route path="/admin" element={me?.role === 'admin' ? <Admin /> : <Navigate to="/" />} />
      </Routes></main>
    <footer>Digital Heroes. A share of every subscription goes to the cause you choose.</footer>
  </>);
}
