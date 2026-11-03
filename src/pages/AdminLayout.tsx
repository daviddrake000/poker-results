import { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../data';
import { friendlyMessage } from '../lib/errors';
import { useAuth } from '../ui/auth';
import { Brand, ErrorBox, Loading } from '../ui/common';

export function AdminLayout() {
  const { session, access, refreshAccess } = useAuth();
  const navigate = useNavigate();
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function signOut() {
    try {
      await api().signOut();
      navigate('/signin', { replace: true });
    } catch (e) {
      setSignOutError(friendlyMessage(e));
    }
  }

  // Only a routing hint: the database refuses admin reads and writes from
  // anyone who isn't in the admins table, whatever this screen shows.
  let content;
  if (access.status === 'loading') {
    content = <Loading />;
  } else if (access.status === 'error') {
    content = <ErrorBox message={access.message} onRetry={refreshAccess} />;
  } else if (access.access !== 'admin') {
    content = (
      <div className="card notice">
        <div className="notice-title">Admins only</div>
        <p>
          This part is for whoever keeps the books. If that’s you, ask the owner to add your account to the admins
          table.
        </p>
        <Link to="/" className="btn">
          Go to standings
        </Link>
      </div>
    );
  } else {
    content = <Outlet />;
  }

  return (
    <div className="shell">
      <header className="topbar">
        <Brand to="/admin" />
        <div className="topbar-actions">
          <span className="who">{session?.email}</span>
          <button type="button" className="btn small" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      {signOutError && <p className="error-box">{signOutError}</p>}
      <main>{content}</main>
      <Link to="/" className="footer-link">
        View the standings
      </Link>
    </div>
  );
}
