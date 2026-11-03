import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../data';
import { friendlyMessage } from '../lib/errors';
import { useAuth } from '../ui/auth';
import { Brand, ErrorBox, Loading } from '../ui/common';
import { useTitle } from '../ui/title';

export function Login() {
  useTitle('Sign in');
  const { ready, session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) return <Loading />;
  if (session) return <Navigate to={from} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api().signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch (e) {
      setError(friendlyMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <Brand />
      </header>
      <main>
        <h1>Sign in</h1>
        <p className="subtitle">Poker Night is private to our game. Sign in to see the standings and who owes who.</p>
        <form className="card stack login-card" onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <ErrorBox message={error} />}
          <button type="submit" className="btn primary block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="card switch-card">
          <span>New here?</span>
          <Link to="/signup" className="btn">
            Request access
          </Link>
        </div>
      </main>
    </div>
  );
}
