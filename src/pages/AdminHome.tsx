import { Link } from 'react-router-dom';
import { api } from '../data';
import type { GameSummary } from '../data/types';
import { formatGameDate } from '../lib/dates';
import { Amount, Empty, ErrorBox, Loading } from '../ui/common';
import { useAsync } from '../ui/hooks';
import { useTitle } from '../ui/title';

function GameList({ games }: { games: GameSummary[] }) {
  return (
    <ul className="list">
      {games.map((g) => (
        <li key={g.id}>
          <Link to={`/admin/games/${g.id}`} className="row-link">
            <div className="card game-row">
              <div>
                <div className="game-date">{formatGameDate(g.playedOn)}</div>
                <div className="game-meta">
                  {g.location ? `${g.location} · ` : ''}
                  {g.playerCount} {g.playerCount === 1 ? 'player' : 'players'}
                </div>
              </div>
              <div className="pot">
                <small>Pot</small>
                <Amount cents={g.potCents} />
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function AdminHome() {
  useTitle('Admin');
  const [drafts, reloadDrafts] = useAsync(() => api().games('draft'), []);
  const [finals, reloadFinals] = useAsync(() => api().games('final'), []);
  const [members] = useAsync(() => api().members(), []);
  const waiting =
    members.status === 'ready' ? members.data.filter((m) => m.status === 'pending' && !m.isAdmin).length : 0;

  return (
    <>
      <h1>Admin</h1>
      <p className="subtitle">Start tonight’s game, finish one in progress, or fix a past game.</p>

      <div className="stack">
        <Link to="/admin/new" className="btn primary block">
          + Start a game
        </Link>
        <Link to="/admin/members" className="btn block">
          Members
          {waiting > 0 && (
            <span className="count-pill" aria-label={`${waiting} waiting for approval`}>
              {waiting}
            </span>
          )}
        </Link>
      </div>

      <h2>In progress</h2>
      {drafts.status === 'loading' && <Loading rows={1} />}
      {drafts.status === 'error' && <ErrorBox message={drafts.message} onRetry={reloadDrafts} />}
      {drafts.status === 'ready' &&
        (drafts.data.length === 0 ? (
          <Empty title="Nothing in progress">Every game has been finalized.</Empty>
        ) : (
          <GameList games={drafts.data} />
        ))}

      <h2>Published games</h2>
      {finals.status === 'loading' && <Loading rows={2} />}
      {finals.status === 'error' && <ErrorBox message={finals.message} onRetry={reloadFinals} />}
      {finals.status === 'ready' &&
        (finals.data.length === 0 ? (
          <Empty title="Nothing published yet">Finalized games appear here and on the public site.</Empty>
        ) : (
          <GameList games={finals.data} />
        ))}
    </>
  );
}
