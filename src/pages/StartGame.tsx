import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { STANDARD_BUY_IN_CENTS } from '../config';
import { api } from '../data';
import type { Player } from '../data/types';
import { isIsoDate, todayIso } from '../lib/dates';
import { friendlyMessage } from '../lib/errors';
import { centsToInput, parseDollars } from '../lib/money';
import { checkSheet, type SheetLine } from '../lib/sheet';
import { Amount, ErrorBox, Loading } from '../ui/common';
import { useAsync } from '../ui/hooks';
import { MoneyField } from '../ui/MoneyField';
import { NewPlayerForm } from '../ui/NewPlayerForm';
import { useTitle } from '../ui/title';

export function StartGame() {
  useTitle('Start a game');
  const [state, reload] = useAsync(() => api().players(), []);
  if (state.status === 'loading') return <Loading rows={5} />;
  if (state.status === 'error') return <ErrorBox message={state.message} onRetry={reload} />;
  return <StartGameForm initialPlayers={state.data} />;
}

interface Pick {
  buyIn: string;
  /** Edited by hand, so changing the standard buy-in leaves it alone. */
  custom: boolean;
}

function byName(a: Player, b: Player): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

function StartGameForm({ initialPlayers }: { initialPlayers: Player[] }) {
  const navigate = useNavigate();
  const [players, setPlayers] = useState(initialPlayers);
  const [playedOn, setPlayedOn] = useState(todayIso());
  const [location, setLocation] = useState('');
  const [standard, setStandard] = useState(centsToInput(STANDARD_BUY_IN_CENTS));
  const [picks, setPicks] = useState<Map<string, Pick>>(new Map());
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [showErrors, setShowErrors] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // If the game row was created but its players weren't, retry into the same game.
  const createdId = useRef<string | null>(null);

  const active = useMemo(() => players.filter((p) => p.active).sort(byName), [players]);
  const names = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);
  // The picked players as entry-sheet lines; cash-outs are entered at the end of the night.
  const lines: SheetLine[] = active
    .filter((p) => picks.has(p.id))
    .map((p) => ({ key: p.id, playerId: p.id, buyIn: picks.get(p.id)!.buyIn, cashOut: '' }));
  const check = checkSheet(lines, names);
  const errorFor = new Map(check.lines.map((l) => [l.key, l.buyInError]));

  const standardParsed = parseDollars(standard);
  const standardError =
    standardParsed.kind === 'error'
      ? standardParsed.message
      : standardParsed.kind === 'blank'
        ? 'Enter the usual buy-in'
        : null;
  const dateOk = isIsoDate(playedOn);

  let blocker: string | null = null;
  if (!dateOk) blocker = 'Choose a date';
  else if (lines.length < 2) blocker = lines.length === 0 ? 'Pick the players' : 'Pick at least 2 players';
  else if (!check.canSave) blocker = 'Fix the buy-ins marked in red';

  function toggle(id: string) {
    setPicks((current) => {
      const next = new Map(current);
      if (next.has(id)) next.delete(id);
      else next.set(id, { buyIn: standard, custom: false });
      return next;
    });
  }

  function pickAll() {
    setPicks((current) => {
      const next = new Map(current);
      for (const p of active) if (!next.has(p.id)) next.set(p.id, { buyIn: standard, custom: false });
      return next;
    });
  }

  function changeStandard(text: string) {
    setStandard(text);
    setPicks((current) => new Map([...current].map(([id, pick]) => [id, pick.custom ? pick : { ...pick, buyIn: text }])));
  }

  function changeBuyIn(id: string, text: string) {
    setPicks((current) => new Map(current).set(id, { buyIn: text, custom: true }));
  }

  async function start() {
    if (blocker) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!createdId.current) {
        const game = await api().createGame({ playedOn, location: location.trim() || null, notes: null });
        createdId.current = game.id;
      }
      await api().saveEntries(createdId.current, check.entries);
      navigate(`/admin/games/${createdId.current}`, { replace: true });
    } catch (e) {
      const saved = createdId.current
        ? ' The game was created as a draft, but its players weren’t saved. Press Start game to try again.'
        : '';
      setError(`Not started. ${friendlyMessage(e)}${saved}`);
      setBusy(false);
    }
  }

  return (
    <div className="entry-page">
      <Link to="/admin" className="back-link">
        ← Admin
      </Link>
      <h1>Start a game</h1>
      <p className="subtitle">Tick everyone who’s playing. They all start on the usual buy-in; change anyone who’s different.</p>

      <section className="card stack" aria-label="Game setup">
        <div className="grid-2">
          <div className="field">
            <label htmlFor="played-on">Date</label>
            <input
              id="played-on"
              className="input"
              type="date"
              value={playedOn}
              aria-invalid={!dateOk}
              onChange={(e) => setPlayedOn(e.target.value)}
            />
          </div>
          <MoneyField
            id="standard-buy-in"
            label="Usual buy-in"
            value={standard}
            error={standardError}
            onChange={changeStandard}
          />
        </div>
        <div className="field">
          <label htmlFor="location">Location (optional)</label>
          <input id="location" className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
      </section>

      <div className="section-head">
        <h2>Who’s playing?</h2>
        <div className="btn-row">
          <button type="button" className="btn small ghost" onClick={pickAll}>
            All
          </button>
          <button type="button" className="btn small ghost" onClick={() => setPicks(new Map())}>
            None
          </button>
        </div>
      </div>

      {active.length === 0 && !adding && <div className="card empty">No players yet. Add the first one below.</div>}

      <ul className="list">
        {active.map((p) => {
          const pick = picks.get(p.id);
          const fieldId = `buyin-${p.id}`;
          const rowError = pick && (showErrors || touched.has(p.id)) ? (errorFor.get(p.id) ?? null) : null;
          return (
            <li key={p.id} className={`card pick-row ${pick ? 'picked' : ''}`}>
              <label className="pick">
                <input type="checkbox" checked={!!pick} onChange={() => toggle(p.id)} />
                <span className="player-name">{p.name}</span>
              </label>
              {pick && (
                <div className="pick-buyin money-input">
                  <input
                    id={fieldId}
                    className="input"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    aria-label={`${p.name}’s buy-in`}
                    aria-invalid={rowError ? true : undefined}
                    value={pick.buyIn}
                    onChange={(e) => changeBuyIn(p.id, e.target.value)}
                    onBlur={() => setTouched((t) => new Set(t).add(p.id))}
                  />
                </div>
              )}
              {rowError && <span className="field-error pick-error">{rowError}</span>}
            </li>
          );
        })}
      </ul>

      <div style={{ marginTop: 12 }}>
        {adding ? (
          <div className="card">
            <NewPlayerForm
              id="start-new-player"
              players={players}
              onDone={(player, created) => {
                if (created) setPlayers((ps) => [...ps, player]);
                setPicks((current) =>
                  current.has(player.id) ? current : new Map(current).set(player.id, { buyIn: standard, custom: false }),
                );
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        ) : (
          <button type="button" className="btn block" onClick={() => setAdding(true)}>
            + New player
          </button>
        )}
      </div>

      <div className="tally" role="region" aria-label="Game summary">
        <div className="tally-inner">
          {error && <ErrorBox message={error} />}
          <div className="tally-numbers two">
            <div>
              <small>Players</small>
              <span className="num">{lines.length}</span>
            </div>
            <div>
              <small>Bought in</small>
              <Amount cents={check.totalInCents} />
            </div>
          </div>
          {showErrors && blocker && <div className="tally-status warn">{blocker}</div>}
          <button type="button" className="btn primary block" onClick={start} disabled={busy}>
            {busy ? 'Starting…' : lines.length >= 2 ? `Start game with ${lines.length} players` : 'Start game'}
          </button>
        </div>
      </div>
    </div>
  );
}
