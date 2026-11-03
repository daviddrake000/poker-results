import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyMessage } from '../lib/errors';

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T };

/** Load something once (and again when `deps` change or `reload` is called). */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    const run = ++latest.current;
    setState({ status: 'loading' });
    load().then(
      (data) => {
        if (run === latest.current) setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (run === latest.current) setState({ status: 'error', message: friendlyMessage(error) });
      },
    );
  }, [...deps, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return [state, reload] as const;
}
