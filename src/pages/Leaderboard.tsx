import { useState } from 'react';
import { CARRIED_OVER_GAMES } from '../config';
import { api } from '../data';
import type { PlayerStat } from '../data/types';
import { formatSignedCents, netTone } from '../lib/money';
import { useAsync } from '../ui/hooks';
import { Empty, ErrorBox, Loading } from '../ui/common';
import { useTitle } from '../ui/title';

type SortKey = 'net' | 'perGame';

const perGame = (p: PlayerStat) => Math.round(p.netCents / p.gamesPlayed);

/** The diverging bar beside each row, scaled to the biggest swing on the board. */
function Spark({ cents, maxAbs }: { cents: number; maxAbs: number }) {
  const width = maxAbs === 0 ? 0 : Math.max(3, (Math.abs(cents) / maxAbs) * 50);
  return (
    <span className="spark" aria-hidden="true">
      {cents !== 0 && <span className={cents > 0 ? 'win-bar' : 'loss-bar'} style={{ width: `${width}%` }} />}
    </span>
  );
}

export function Leaderboard() {
  useTitle('Standings');
  const [state, reload] = useAsync(() => api().leaderboard(), []);
  const [games] = useAsync(() => api().games('final'), []);
  const [sort, setSort] = useState<SortKey>('net');

  const players = state.status === 'ready' ? state.data : [];
  const hasCarryover = players.some((p) => p.carriedGames > 0);
  const gameCount =
    games.status === 'ready' ? games.data.length + (hasCarryover ? CARRIED_OVER_GAMES : 0) : null;

  // The API already ranks by net (ties by name); per-game re-sorts a copy.
  const rows = sort === 'net' ? players : [...players].sort((a, b) => perGame(b) - perGame(a));
  const value = (p: PlayerStat) => (sort === 'net' ? p.netCents : perGame(p));
  const maxAbs = Math.max(0, ...rows.map((p) => Math.abs(value(p))));

  return (
    <>
      <section className="ticker-stats" aria-label="Totals">
        <div className="ticker-stat">
          <small>Players</small>
          <span className="num">{state.status === 'ready' ? players.length : '–'}</span>
        </div>
        <div className="ticker-stat">
          <small>Games</small>
          <span className="num">{gameCount ?? '–'}</span>
        </div>
      </section>

      <div className="title-row">
        <h1>Standings</h1>
        <div className="segmented" role="group" aria-label="Rank by">
          <button type="button" aria-pressed={sort === 'net'} onClick={() => setSort('net')}>
            NET
          </button>
          <button type="button" aria-pressed={sort === 'perGame'} onClick={() => setSort('perGame')}>
            /GAME
          </button>
        </div>
      </div>

      {state.status === 'loading' && (
        <div style={{ marginTop: 20 }}>
          <Loading rows={6} />
        </div>
      )}
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={reload} />}
      {state.status === 'ready' && players.length === 0 && (
        <Empty title="No games yet">Standings appear once the first game is finalized.</Empty>
      )}
      {state.status === 'ready' && players.length > 0 && (
        <div className="board">
          <div className="board-head" aria-hidden="true">
            <span>#</span>
            <span>Player</span>
            <span>GP</span>
            <span className="align-right">{sort === 'net' ? 'Net' : 'Per game'}</span>
            <span className="align-right spark-head">±</span>
          </div>
          <ol className="board-list" aria-label="Leaderboard">
            {rows.map((p, i) => (
              <li key={p.id} className={`board-row ${i === 0 ? 'first' : ''}`}>
                <span className="rank" aria-label={`Rank ${i + 1}`}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="who-cell">
                  <span className="player-name">{p.name}</span>
                  {/* Carried-over totals have no nights to pick a best or worst from. */}
                  {p.trackedGames > 0 && (
                    <span className="nights">
                      <span aria-hidden="true">▲</span>
                      <span className="sr-only">Best night</span> {formatSignedCents(p.bestNightCents)}{' '}
                      <span aria-hidden="true">▼</span>
                      <span className="sr-only">Worst night</span> {formatSignedCents(p.worstNightCents)}
                    </span>
                  )}
                </span>
                <span className="gp" aria-label={`${p.gamesPlayed} ${p.gamesPlayed === 1 ? 'game' : 'games'}`}>
                  {p.gamesPlayed}
                </span>
                <span className={`num net-cell ${netTone(value(p))}`}>
                  {formatSignedCents(value(p))}
                  {sort === 'perGame' && <span className="sr-only"> per game</span>}
                </span>
                <Spark cents={value(p)} maxAbs={maxAbs} />
              </li>
            ))}
          </ol>
          <p className="board-note">
            {hasCarryover
              ? 'All-time totals, including results carried over from earlier games. Best and worst nights count games played here.'
              : 'Season totals from finalized games.'}
          </p>
        </div>
      )}
    </>
  );
}
