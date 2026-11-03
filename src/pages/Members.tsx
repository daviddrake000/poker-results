import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../data';
import type { Member, MemberStatus } from '../data/types';
import { friendlyMessage } from '../lib/errors';
import { useAuth } from '../ui/auth';
import { Empty, ErrorBox, Loading } from '../ui/common';
import { useAsync } from '../ui/hooks';
import { useTitle } from '../ui/title';

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function Members() {
  useTitle('Members');
  const [state, reload] = useAsync(() => api().members(), []);

  return (
    <>
      <Link to="/admin" className="back-link">
        ← Admin
      </Link>
      <h1>Members</h1>
      <p className="subtitle">
        Anyone can request access. Only people you approve can see the standings and games.
      </p>
      {state.status === 'loading' && <Loading rows={3} />}
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={reload} />}
      {state.status === 'ready' && <MemberLists initial={state.data} />}
    </>
  );
}

function MemberLists({ initial }: { initial: Member[] }) {
  const { session } = useAuth();
  const [members, setMembers] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(member: Member, status: MemberStatus) {
    if (status === 'rejected' && member.status === 'approved') {
      const who = member.displayName ?? member.email ?? 'this account';
      if (!window.confirm(`Remove ${who}’s access? They won’t be able to see the standings until you approve them again.`)) {
        return;
      }
    }
    setBusyId(member.userId);
    setError(null);
    try {
      await api().setMemberStatus(member.userId, status);
      setMembers((ms) => ms.map((m) => (m.userId === member.userId ? { ...m, status } : m)));
    } catch (e) {
      setError(friendlyMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  const pending = members.filter((m) => m.status === 'pending' && !m.isAdmin);
  const approved = members.filter((m) => m.status === 'approved' || m.isAdmin);
  const rejected = members.filter((m) => m.status === 'rejected' && !m.isAdmin);

  const row = (m: Member) => {
    const busy = busyId === m.userId;
    const isMe = m.userId === session?.userId;
    const who = m.displayName ?? m.email ?? 'this account';
    return (
      <li key={m.userId} className="card member-row">
        <div className="member-who">
          <span className="player-name">{m.displayName ?? m.email ?? 'Unnamed account'}</span>
          {m.isAdmin ? (
            <span className="badge final">Admin</span>
          ) : (
            <span className={`badge ${m.status}`}>
              {m.status === 'pending' ? 'Waiting' : m.status === 'approved' ? 'Member' : 'Not approved'}
            </span>
          )}
        </div>
        <div className="member-email">
          {m.displayName && m.email ? `${m.email} · ` : ''}asked {shortDate(m.requestedAt)}
          {isMe ? ' · you' : ''}
        </div>
        {!m.isAdmin && (
          <div className="btn-row">
            {m.status !== 'approved' && (
              <button
                type="button"
                className="btn primary small"
                aria-label={`Approve ${who}`}
                disabled={busy}
                onClick={() => decide(m, 'approved')}
              >
                Approve
              </button>
            )}
            {m.status === 'pending' && (
              <button
                type="button"
                className="btn small"
                aria-label={`Reject ${who}`}
                disabled={busy}
                onClick={() => decide(m, 'rejected')}
              >
                Reject
              </button>
            )}
            {m.status === 'approved' && (
              <button
                type="button"
                className="btn danger small"
                aria-label={`Remove ${who}’s access`}
                disabled={busy}
                onClick={() => decide(m, 'rejected')}
              >
                Remove access
              </button>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      {error && <ErrorBox message={error} />}

      <h2>Waiting for approval</h2>
      {pending.length === 0 ? (
        <Empty title="Nobody waiting">New sign-ups show up here.</Empty>
      ) : (
        <ul className="list">{pending.map(row)}</ul>
      )}

      <h2>Members</h2>
      {approved.length === 0 ? <Empty title="No members yet" /> : <ul className="list">{approved.map(row)}</ul>}

      {rejected.length > 0 && (
        <>
          <h2>Not approved</h2>
          <ul className="list">{rejected.map(row)}</ul>
        </>
      )}
    </>
  );
}
