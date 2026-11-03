import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../data';
import { friendlyMessage } from '../lib/errors';
import { MIN_PASSWORD_LENGTH, checkSignUp } from '../lib/signup';
import { useAuth } from '../ui/auth';
import { Brand, ErrorBox, Loading } from '../ui/common';
import { useTitle } from '../ui/title';

export function SignUp() {
  useTitle('Request access');
  const { ready, session } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (!ready) return <Loading />;
  if (session && !sentTo) return <Navigate to="/" replace />;

  const check = checkSignUp({ name, email, password });
  const shown = (message: string | null) => (showErrors ? message : null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!check.ok) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { needsConfirmation } = await api().signUp({
        email: check.clean.email,
        password: check.clean.password,
        displayName: check.clean.name,
      });
      if (needsConfirmation) {
        setSentTo(check.clean.email);
      } else {
        navigate('/', { replace: true });
      }
    } catch (e) {
      setError(friendlyMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <Brand />
      </header>
      <main>
        {sentTo ? (
          <div className="card notice stack" style={{ marginTop: 24 }}>
            <div className="notice-title">Check your email</div>
            <p style={{ margin: 0 }}>
              We sent a link to <b>{sentTo}</b>. Open it to confirm your address. After that, an admin needs to
              approve you before you can see the standings.
            </p>
            <Link to="/signin" className="btn">
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h1>Request access</h1>
            <p className="subtitle">Create an account. An admin will approve it before you can see anything.</p>
            <form className="card stack login-card" onSubmit={submit} noValidate>
              <div className="field">
                <label htmlFor="name">Your name</label>
                <input
                  id="name"
                  className="input"
                  autoComplete="name"
                  aria-invalid={shown(check.errors.name) ? true : undefined}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                {shown(check.errors.name) && <span className="field-error">{check.errors.name}</span>}
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  aria-invalid={shown(check.errors.email) ? true : undefined}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {shown(check.errors.email) && <span className="field-error">{check.errors.email}</span>}
              </div>
              <div className="field">
                <label htmlFor="password">Password (at least {MIN_PASSWORD_LENGTH} characters)</label>
                <div className="new-player">
                  <input
                    id="password"
                    className="input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    aria-invalid={shown(check.errors.password) ? true : undefined}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn ghost"
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((s) => !s)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {shown(check.errors.password) && <span className="field-error">{check.errors.password}</span>}
              </div>
              {error && <ErrorBox message={error} />}
              <button type="submit" className="btn primary block" disabled={busy}>
                {busy ? 'Sending…' : 'Request access'}
              </button>
            </form>
            <div className="card switch-card">
              <span>Already have an account?</span>
              <Link to="/signin" className="btn">
                Sign in
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
