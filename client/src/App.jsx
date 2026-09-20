import { useEffect, useState } from 'react';
import { Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import { sb, getCurrentUser, onAuthChange, logout } from './api';
import Home from './pages/Home';
import Charities from './pages/Charities';
import Pricing from './pages/Pricing';
import CharityDetail from './pages/CharityDetail';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';

export default function App() {
  const [me, setMe] = useState(null);
  const nav = useNavigate();

  const load = () => {
    getCurrentUser().then(setMe).catch(() => setMe(null));
  };

  useEffect(() => {
    load();
    const unsubCustom = onAuthChange(() => load());
    const { data: sbData } = sb.auth.onAuthStateChange(() => load());
    return () => {
      unsubCustom();
      sbData?.subscription?.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    setMe(null);
    nav('/');
  };

  return (
    <>
      <header className="nav">
        <Link to="/" className="logo">digital<b>heroes</b></Link>
        <nav>
          <Link to="/charities">Charities</Link>
          <Link to="/pricing">Pricing</Link>
          {me && <Link to="/dashboard">Dashboard</Link>}
          {me?.role === 'admin' && <Link to="/admin">Admin</Link>}
          {me ? (
            <div className="nav-user-section">
              <span className="nav-user-tag" title={me.email}>
                {me.full_name || me.email}
              </span>
              <button className="link nav-logout-btn" onClick={handleLogout}>Log out</button>
            </div>
          ) : (
            <>
              <Link to="/login" className="nav-login-link">Log in</Link>
              <Link to="/signup" className="btn sm">Join now</Link>
            </>
          )}
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/charities" element={<Charities />} />
          <Route path="/charities/:id" element={<CharityDetail />} />
          <Route path="/pricing" element={<Pricing me={me} />} />
          <Route path="/login" element={me ? <Navigate to="/dashboard" /> : <Login />} />
          <Route path="/signup" element={me ? <Navigate to="/dashboard" /> : <Signup />} />
          <Route path="/dashboard" element={me ? <Dashboard /> : <Navigate to="/login" />} />
          <Route path="/admin" element={me?.role === 'admin' ? <Admin /> : <Navigate to="/" />} />
        </Routes>
      </main>

      <footer>
        <div>
          <Link to="/" className="logo">digital<b>heroes</b></Link>
          <p>Play a round. Fund a cause.</p>
        </div>
        <div className="fl">
          <Link to="/charities">Charities</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/signup">Join now</Link>
        </div>
        <small>A share of every subscription goes to the charity you choose.</small>
      </footer>
    </>
  );
}
