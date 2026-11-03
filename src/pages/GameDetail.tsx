import { Link, useParams } from 'react-router-dom';
import { api } from '../data';
import type { Entry } from '../data/types';
import { formatGameDate } from '../lib/dates';
import { settle, type SettlementResult } from '../lib/settlement';
import { Amount, ErrorBox, Loading, Net, SettlementPlan } from '../ui/common';
import { useAsync } from '../ui/hooks';
import { useTitle } from '../ui/title';
import { NotFound } from './NotFound';

export function settlementFor(entries: Entry[]): SettlementResult {
  return settle(
    entries.map((e) => ({
      playerId: e.playerId,
      name: e.playerName,
      buyInCents: e.buyInCents,
      cashOutCents: e.cashOutCents,
    })),
  );
}

export function EntryResults({ entries }: { entries: Entry[] }) {
  const totalIn = entries.reduce((s, e) => s + e.buyInCents, 0);
  const totalOut = entries.reduce((s, e) => s + e.cashOutCents, 0);
  return (
    <>
      <ul className="list">
        {entries.map((e) => (
          <li key={e.id} className="card result-row">
            <span className="player-name">{e.playerName}</span>
            <Net cents={e.cashOutCents - e.buyInCents} className="big-net" />
            <span className="detail">
              In <Amount cents={e.buyInCents} /> · Out <Amount cents={e.cashOutCents} />
            </span>
          </li>
        ))}
      </ul>
      <div className="totals-line">
        <span>
          Total in <Amount cents={totalIn} />
        </span>
        <span>
          Total out <Amount cents={totalOut} />
        </span>
      </div>
    </>
  );
}

export function GameDetail() {
  const { id = '' } = useParams();
  const [state, reload] = useAsync(() => api().game(id, { finalOnly: true }), [id]);
  useTitle(state.status === 'ready' && state.data ? formatGameDate(state.data.playedOn) : 'Game');

  if (state.status === 'loading') return <Loading rows={4} />;
  if (state.status === 'error') return <ErrorBox message={state.message} onRetry={reload} />;
  // Drafts come back as null for the public (RLS), and finalOnly hides them
  // from signed-in admins on this page too: treat both as not found.
  if (!state.data) return <NotFound what="game" />;

  const game = state.data;
  return (
    <>
      <Link to="/games" className="back-link">
        ← All games
      </Link>
      <h1>{formatGameDate(game.playedOn)}</h1>
      {game.location && <p className="subtitle">{game.location}</p>}

      <h2>Results</h2>
      <EntryResults entries={game.entries} />

      <h2>Settle up</h2>
      <SettlementPlan result={settlementFor(game.entries)} />

      {game.notes && (
        <>
          <h2>Notes</h2>
          <p className="card notes">{game.notes}</p>
        </>
      )}
    </>
  );
}
