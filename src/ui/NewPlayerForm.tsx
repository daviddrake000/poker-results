import { useState } from 'react';
import { api } from '../data';
import type { Player } from '../data/types';
import { friendlyMessage } from '../lib/errors';

/**
 * Add a player without leaving the screen. A name that matches an existing
 * player (ignoring case and extra spaces) picks that player instead of
 * creating a near-duplicate.
 */
export function NewPlayerForm({
  id,
  players,
  onDone,
  onCancel,
}: {
  id: string;
  players: Player[];
  onDone: (player: Player, created: boolean) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) {
      setError('Type a name');
      return;
    }
    const existing = players.find((p) => p.name.toLowerCase() === clean.toLowerCase());
    if (existing) {
      onDone(existing, false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onDone(await api().addPlayer(clean), true);
    } catch (e) {
      setError(friendlyMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <label htmlFor={id}>New player’s name</label>
      <div className="new-player">
        <input
          id={id}
          className="input"
          autoFocus
          autoComplete="off"
          enterKeyHint="done"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void add();
            }
          }}
        />
        <button type="button" className="btn primary" onClick={add} disabled={busy}>
          {busy ? '…' : 'Add'}
        </button>
      </div>
      {error && <span className="field-error">{error}</span>}
      <button type="button" className="btn ghost small" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
