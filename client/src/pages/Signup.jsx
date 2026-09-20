import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, signup } from '../api';

export default function Signup() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [charityId, setCharityId] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(true);

  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const [charities, setCharities] = useState([]);
  const [loadingCharities, setLoadingCharities] = useState(true);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const nav = useNavigate();

  useEffect(() => {
    let active = true;
    api('/charities')
      .then((data) => {
        if (active && Array.isArray(data)) {
          setCharities(data);
          // Preselect first featured charity if available
          const featured = data.find((c) => c.featured);
          if (featured) setCharityId(featured.id);
          else if (data.length > 0) setCharityId(data[0].id);
        }
      })
      .catch((e) => {
        console.warn('Could not load charities list:', e);
      })
      .finally(() => {
        if (active) setLoadingCharities(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedCharity = charities.find((c) => c.id === charityId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');

    if (!fullName.trim()) {
      setErr('Please enter your full name.');
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErr('Please enter a valid email address.');
      return;
    }
    if (!password || password.length < 6) {
      setErr('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErr('Passwords do not match. Please re-check your password.');
      return;
    }
    if (!charityId) {
      setErr('Please choose a charity to receive your impact contribution.');
      return;
    }
    if (!agreeTerms) {
      setErr('Please accept the draw rules and terms to continue.');
      return;
    }

    setLoading(true);
    try {
      await signup({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        charity_id: charityId
      });
      // After signup with JWT, guide new member directly to choose subscription plan
      nav('/pricing');
    } catch (x) {
      setErr(x.message || 'Failed to create account. Please check your information.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="page narrow auth-page">
      <div className="auth-card card">
        <div className="auth-header">
          <span className="eyebrow">Play a Round • Fund a Cause</span>
          <h1>Create your account</h1>
          <p className="lead" style={{ fontSize: '1rem', marginBottom: '1.2rem' }}>
            Join the community, enter monthly draws, and choose which charity your subscription helps support.
          </p>
        </div>

        {err && (
          <div className="auth-alert err" role="alert" aria-live="assertive">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{err}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form" noValidate={false}>
          <div className="form-group">
            <label htmlFor="signup-name">Full name</label>
            <input
              id="signup-name"
              type="text"
              required
              autoFocus
              placeholder="e.g. Alex Morgan"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="signup-email">Email address</label>
            <input
              id="signup-email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="signup-password">Password (6+ characters)</label>
            <div className="password-wrap">
              <input
                id="signup-password"
                type={showPw ? 'text' : 'password'}
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Choose a secure password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                className="pw-toggle-btn"
                onClick={() => setShowPw(!showPw)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="signup-confirm-password">Confirm password</label>
            <div className="password-wrap">
              <input
                id="signup-confirm-password"
                type={showConfirmPw ? 'text' : 'password'}
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Re-type password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                className="pw-toggle-btn"
                onClick={() => setShowConfirmPw(!showConfirmPw)}
                aria-label={showConfirmPw ? 'Hide password' : 'Show password'}
              >
                {showConfirmPw ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
            </div>
            {confirmPassword && password !== confirmPassword && (
              <p className="field-msg-err">Passwords do not match</p>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="signup-charity">Choose your supported charity</label>
            <select
              id="signup-charity"
              required
              value={charityId}
              onChange={(e) => setCharityId(e.target.value)}
              disabled={loading || loadingCharities}
            >
              <option value="">Choose a charity</option>
              {charities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.category ? `(${c.category})` : ''} {c.featured ? '★' : ''}
                </option>
              ))}
            </select>
            {selectedCharity && (
              <div className="charity-preview-chip">
                <span>Supporting: <b>{selectedCharity.name}</b></span>
                {selectedCharity.mission && (
                  <small style={{ marginTop: '0.2rem' }}>{selectedCharity.mission}</small>
                )}
              </div>
            )}
            <small style={{ marginTop: '0.3rem' }}>
              At least 10% (and up to 100%) of your subscription goes directly to this charity. You can update this anytime.
            </small>
          </div>

          <div className="form-options">
            <label className="checkbox-label">
              <input
                type="checkbox"
                required
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
              />
              <span>I agree to the Digital Heroes rules, privacy policy and draw terms.</span>
            </label>
          </div>

          <button type="submit" className="btn big auth-submit-btn" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Creating account…' : 'Create account & continue'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <Link to="/login" className="link">Log in</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
