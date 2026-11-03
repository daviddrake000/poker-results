import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../data';
import type { Access } from '../data/types';
import { friendlyMessage } from '../lib/errors';
import { Brand, ErrorBox } from '../ui/common';
import { useTitle } from '../ui/title';

const COPY: Record<Exclude<Access, 'admin' | 'approved'>, { title: string; body: string }> = {
  pending: {
    title: 'Waiting for approval',
    body: 'Thanks for signing up. An admin needs to approve your account before you can see the standings and games. Check back once they’ve had a look.',
  },
  rejected: {
    title: 'Access not approved',
    body: 'An admin didn’t approve this account. If you think that’s a mistake, ask whoever runs the game.',
  },
  none: {
    title: 'Not on the members list',
    body: 'This account isn’t on the members list yet. Ask an admin to add you.',
  },
};

/** Shown to a signed-in account that isn't an approved member (yet). */
export function WaitingForApproval({
  access,
  email,
  onCheckAgain,
}: {
  access: Access;
  email: string | null;
  onCheckAgain: () => void;
}) {
  const copy = access === 'admin' || access === 'approved' ? COPY.none : COPY[access];
  useTitle(copy.title);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    try {
      await api().signOut();
      navigate('/signin', { replace: true });
    } catch (e) {
      setError(friendlyMessage(e));
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <Brand />
      </header>
      <main>
        <div className="card notice stack" style={{ marginTop: 24 }}>
          <div className="notice-title">{copy.title}</div>
          <p style={{ margin: 0 }}>{copy.body}</p>
          {email && <p className="muted" style={{ margin: 0 }}>Signed in as {email}</p>}
          {error && <ErrorBox message={error} />}
          <div className="btn-row" style={{ justifyContent: 'center' }}>
            {access === 'pending' && (
              <button type="button" className="btn primary" onClick={onCheckAgain}>
                Check again
              </button>
            )}
            <button type="button" className="btn" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
