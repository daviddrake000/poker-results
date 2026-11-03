import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../data';
import { friendlyMessage } from '../lib/errors';
import { useAuth } from '../ui/auth';
import { Brand } from '../ui/common';

export function PublicLayout() {
  const { session, access } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const isAdmin = access.status === 'ready' && access.access === 'admin';

  async function signOut() {
    try {
      await api().signOut();
      navigate('/signin', { replace: true });
    } catch (e) {
      setError(friendlyMessage(e));
    }
  }

  return (
    <>
      <div className="shell">
        <header className="topbar">
          <Brand />
          {session?.email && <span className="who">{session.email}</span>}
        </header>
        <main>
          <Outlet />
        </main>
        <div className="account-bar">
          <button type="button" className="btn small ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
        {error && <p className="error-box">{error}</p>}
      </div>
      <nav className="tabbar" aria-label="Main">
        <NavLink to="/" end>
          Standings
        </NavLink>
        <NavLink to="/games">Games</NavLink>
        {isAdmin && <NavLink to="/admin">Admin</NavLink>}
      </nav>
    </>
  );
}
