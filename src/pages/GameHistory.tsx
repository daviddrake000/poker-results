import { Link } from 'react-router-dom';
import { api } from '../data';
import { formatGameDate } from '../lib/dates';
import { Amount, Empty, ErrorBox, Loading } from '../ui/common';
import { useAsync } from '../ui/hooks';
import { useTitle } from '../ui/title';

export function GameHistory() {
  useTitle('Games');
  const [state, reload] = useAsync(() => api().games('final'), []);

  return (
    <>
      <h1>Games</h1>
      <p className="subtitle">Every finalized night, newest first.</p>
      {state.status === 'loading' && <Loading rows={4} />}
      {state.status === 'error' && <ErrorBox message={state.message} onRetry={reload} />}
      {state.status === 'ready' && state.data.length === 0 && (
        <Empty title="No games yet">Finalized games will show up here.</Empty>
      )}
      {state.status === 'ready' && state.data.length > 0 && (
        <ul className="list">
          {state.data.map((g) => (
            <li key={g.id}>
              <Link to={`/games/${g.id}`} className="row-link">
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
      )}
    </>
  );
}
