import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from '../data';
import type { Access, Session } from '../data/types';
import { friendlyMessage } from '../lib/errors';
import { ErrorBox, Loading } from './common';
import { WaitingForApproval } from '../pages/WaitingForApproval';

export type AccessState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; access: Access };

interface AuthState {
  ready: boolean;
  session: Session | null;
  access: AccessState;
  refreshAccess: () => void;
}

const AuthContext = createContext<AuthState>({
  ready: false,
  session: null,
  access: { status: 'loading' },
  refreshAccess: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  // Remember whose access this is, so a new sign-in never shows the old answer.
  const [lookup, setLookup] = useState<{ userId: string | null; state: AccessState }>({
    userId: null,
    state: { status: 'loading' },
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    const settle = (s: Session | null) => {
      if (!live) return;
      setSession(s);
      setReady(true);
    };
    api().getSession().then(settle, () => settle(null));
    const unsubscribe = api().onAuthChange(settle);
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  // Whenever the signed-in account changes, look up what it may see.
  const userId = session?.userId ?? null;
  useEffect(() => {
    if (!ready || !userId) return;
    let live = true;
    setLookup({ userId, state: { status: 'loading' } });
    api()
      .myAccess()
      .then(
        (a) => live && setLookup({ userId, state: { status: 'ready', access: a } }),
        (e: unknown) => live && setLookup({ userId, state: { status: 'error', message: friendlyMessage(e) } }),
      );
    return () => {
      live = false;
    };
  }, [ready, userId, attempt]);

  const refreshAccess = useCallback(() => setAttempt((n) => n + 1), []);
  const access: AccessState = !userId
    ? { status: 'ready', access: 'none' }
    : lookup.userId === userId
      ? lookup.state
      : { status: 'loading' };

  return (
    <AuthContext.Provider value={{ ready, session, access, refreshAccess }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function isMemberAccess(access: AccessState): boolean {
  return access.status === 'ready' && (access.access === 'admin' || access.access === 'approved');
}

/** Routing only: send signed-out visitors to sign in. RLS does the real gatekeeping. */
export function RequireSignIn({ children }: { children: ReactNode }) {
  const { ready, session } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (!session) {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }
  return children;
}

/**
 * Routing only: the standings and games are for approved members and admins.
 * Everyone else signs in, or waits for an admin to approve them. The database
 * returns no rows to non-members either way.
 */
export function RequireMember({ children }: { children: ReactNode }) {
  const { ready, session, access, refreshAccess } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (!session) {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }
  if (access.status === 'loading') return <Loading />;
  if (access.status === 'error') {
    return (
      <div className="shell" style={{ paddingTop: 24 }}>
        <ErrorBox message={access.message} onRetry={refreshAccess} />
      </div>
    );
  }
  if (!isMemberAccess(access)) {
    return <WaitingForApproval access={access.access} email={session.email} onCheckAgain={refreshAccess} />;
  }
  return children;
}
