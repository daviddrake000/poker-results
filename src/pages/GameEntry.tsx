import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { STANDARD_BUY_IN_CENTS } from '../config';
import { api } from '../data';
import type { GameWithEntries, Player } from '../data/types';
import { formatGameDate, isIsoDate } from '../lib/dates';
import { friendlyMessage } from '../lib/errors';
import { centsToInput, formatCents, formatSignedCents } from '../lib/money';
import { settle } from '../lib/settlement';
import { addToBuyIn, checkSheet, type LineCheck, type SheetLine } from '../lib/sheet';
import { Amount, ErrorBox, Loading, Net, SettlementPlan, StatusBadge } from '../ui/common';
import { useAsync } from '../ui/hooks';
import { MoneyField } from '../ui/MoneyField';
import { NewPlayerForm } from '../ui/NewPlayerForm';
import { useTitle } from '../ui/title';
import { EntryResults, settlementFor } from './GameDetail';
import { NotFound } from './NotFound';

const NEW_PLAYER = '__new__';
const STANDARD_BUY_IN = centsToInput(STANDARD_BUY_IN_CENTS);
/** Save this long after the last change, so typing "25.50" is one save, not five. */
const AUTOSAVE_DELAY_MS = 800;

let keySeq = 0;
function newKey(): string {
  keySeq += 1;
  return `line-${keySeq}`;
}

/** A late arrival starts on the usual buy-in, like everyone else did. */
function emptyLine(): SheetLine {
  return { key: newKey(), playerId: null, buyIn: STANDARD_BUY_IN, cashOut: '' };
}

interface Details {
  playedOn: string;
  location: string;
  notes: string;
}

type Flash = { tone: 'success' | 'error'; text: string } | null;

export function GameEntry() {
  const { id = '' } = useParams();
  const [state, reload] = useAsync(
    async () => {
      const [game, players] = await Promise.all([api().game(id, { finalOnly: false }), api().players()]);
      return { game, players };
    },
    [id],
  );
  const [flash, setFlash] = useState<Flash>(null);
  useEffect(() => setFlash(null), [id]);

  if (state.status === 'loading') return <Loading rows={4} />;
  if (state.status === 'error') return <ErrorBox message={state.message} onRetry={reload} />;
  if (!state.data.game) return <NotFound what="game" />;

  const { game, players } = state.data;
  const afterChange = (message: Flash) => {
    setFlash(message);
    reload();
  };

  return game.status === 'final' ? (
    <FinalGame game={game} flash={flash} onReopened={afterChange} />
  ) : (
    <DraftEditor key={game.id} game={game} initialPlayers={players} flash={flash} onFinalized={afterChange} />
  );
}

function FlashBox({ flash }: { flash: Flash }) {
  if (!flash) return null;
  return (
    <p className={flash.tone === 'success' ? 'success-box' : 'error-box'} role="status">
      {flash.text}
    </p>
  );
}

/* ---------- Finalized: read-only with "Reopen to edit" ---------- */

function FinalGame({
  game,
  flash,
  onReopened,
}: {
  game: GameWithEntries;
  flash: Flash;
  onReopened: (message: Flash) => void;
}) {
  useTitle(`${formatGameDate(game.playedOn)} (final)`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reopen() {
    const ok = window.confirm(
      'Reopen this game for editing?\n\nIt will disappear from the public standings and history until you finalize it again.',
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await api().setStatus(game.id, 'draft');
      onReopened({ tone: 'success', text: 'Reopened. The game is a draft again and hidden from the public.' });
    } catch (e) {
      setError(friendlyMessage(e));
      setBusy(false);
    }
  }

  return (
    <>
      <Link to="/admin" className="back-link">
        ← Admin
      </Link>
      <h1>
        {formatGameDate(game.playedOn)} <StatusBadge status="final" />
      </h1>
      {game.location && <p className="subtitle">{game.location}</p>}
      <FlashBox flash={flash} />

      <div className="btn-row">
        <button type="button" className="btn primary" onClick={reopen} disabled={busy}>
          {busy ? 'Reopening…' : 'Reopen to edit'}
        </button>
        <Link to={`/games/${game.id}`} className="btn ghost">
          Public page
        </Link>
      </div>
      {error && (
        <div style={{ marginTop: 12 }}>
          <ErrorBox message={error} />
        </div>
      )}

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

/* ---------- Draft: the live game sheet ---------- */

function snapshot(details: Details, lines: SheetLine[]): string {
  return JSON.stringify({
    details,
    lines: lines.map(({ playerId, buyIn, cashOut }) => ({ playerId, buyIn: buyIn.trim(), cashOut: cashOut.trim() })),
  });
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  /** `snapshot` is what failed, so the same content isn't retried in a loop. */
  | { kind: 'failed'; message: string; snapshot: string };

function DraftEditor({
  game,
  initialPlayers,
  flash,
  onFinalized,
}: {
  game: GameWithEntries;
  initialPlayers: Player[];
  flash: Flash;
  onFinalized: (message: Flash) => void;
}) {
  const navigate = useNavigate();
  const [initial] = useState(() => {
    const details: Details = { playedOn: game.playedOn, location: game.location ?? '', notes: game.notes ?? '' };
    const fromDb = [...game.entries]
      .sort((a, b) => (a.playerName < b.playerName ? -1 : 1))
      .map((e) => ({
        key: newKey(),
        playerId: e.playerId,
        buyIn: centsToInput(e.buyInCents),
        // Nobody has cashed out yet: show an empty box (blank means $0.00).
        cashOut: e.cashOutCents === 0 ? '' : centsToInput(e.cashOutCents),
      }));
    // An old draft with no players gets two blank lines; they aren't unsaved changes.
    const lines = fromDb.length > 0 ? fromDb : [emptyLine(), emptyLine()];
    return { details, lines, saved: snapshot(details, lines) };
  });
  const [players, setPlayers] = useState(initialPlayers);
  const [details, setDetails] = useState(initial.details);
  const [lines, setLines] = useState(initial.lines);
  const [saved, setSaved] = useState(initial.saved);
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [busy, setBusy] = useState<'finalize' | 'delete' | null>(null);
  const [message, setMessage] = useState<Flash>(flash);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const leaving = useRef(false);
  const saving = useRef(false);

  useTitle(`${formatGameDate(isIsoDate(details.playedOn) ? details.playedOn : game.playedOn)} (draft)`);

  const names = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);
  const check = useMemo(() => checkSheet(lines, names), [lines, names]);
  const dateOk = isIsoDate(details.playedOn);
  const current = snapshot(details, lines);
  const dirty = current !== saved;
  const saveable = check.canSave && dateOk;

  /**
   * Write the sheet as it is right now. Only a sheet with no problems is ever
   * written, so a typo can't reach the database as $0.00.
   */
  async function saveNow(): Promise<boolean> {
    if (saving.current || !saveable) return false;
    const target = current;
    const entries = check.entries;
    saving.current = true;
    setSaveState({ kind: 'saving' });
    try {
      await api().updateGameDetails(game.id, {
        playedOn: details.playedOn,
        location: details.location.trim() || null,
        notes: details.notes.trim() || null,
      });
      await api().saveEntries(game.id, entries);
      setSaved(target);
      setSaveState({ kind: 'idle' });
      return true;
    } catch (e) {
      setSaveState({ kind: 'failed', message: friendlyMessage(e), snapshot: target });
      return false;
    } finally {
      saving.current = false;
    }
  }

  // Autosave: the game is entered live through the night, so nothing should
  // depend on remembering to press Save.
  useEffect(() => {
    if (!dirty || !saveable || busy || saveState.kind === 'saving') return;
    if (saveState.kind === 'failed' && saveState.snapshot === current) return;
    const timer = setTimeout(() => void saveNow(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  });

  // A finalize or delete error goes stale as soon as the sheet changes.
  const lastSeen = useRef(current);
  useEffect(() => {
    if (lastSeen.current === current) return;
    lastSeen.current = current;
    setMessage(null);
  }, [current]);

  // Leaving with changes not yet saved: save first if possible, otherwise ask.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    void (async () => {
      if (saveable && (await saveNow())) {
        blocker.proceed();
      } else if (window.confirm('Some changes aren’t saved because a line has a problem. Leave anyway?')) {
        blocker.proceed();
      } else {
        blocker.reset();
      }
    })();
    // Run once per blocked navigation.
  }, [blocker.state]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (!focusKey) return;
    document.getElementById(`${focusKey}-player`)?.focus();
    setFocusKey(null);
  }, [focusKey]);

  const updateLine = (key: string, patch: Partial<SheetLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const touch = (field: string) => setTouched((t) => (t.has(field) ? t : new Set(t).add(field)));
  const visible = (field: string, error: string | null) =>
    error && (showAllErrors || touched.has(field)) ? error : null;

  function addLine() {
    const line = emptyLine();
    setLines((ls) => [...ls, line]);
    setFocusKey(line.key);
  }

  async function finalize() {
    if (!saveable) {
      setShowAllErrors(true);
      return;
    }
    setBusy('finalize');
    setMessage(null);
    try {
      if (dirty && !(await saveNow())) {
        setMessage({ tone: 'error', text: 'Not finalized: the latest changes couldn’t be saved.' });
        return;
      }
      await api().setStatus(game.id, 'final');
      leaving.current = true;
      onFinalized({ tone: 'success', text: 'Finalized. The game is now on the public standings.' });
    } catch (e) {
      setMessage({ tone: 'error', text: `Not finalized. ${friendlyMessage(e)}` });
    } finally {
      setBusy(null);
    }
  }

  async function deleteDraft() {
    if (!window.confirm('Delete this game and all its lines? This can’t be undone.')) return;
    setBusy('delete');
    setMessage(null);
    try {
      await api().deleteDraft(game.id);
      leaving.current = true;
      navigate('/admin', { replace: true });
    } catch (e) {
      setMessage({ tone: 'error', text: `Not deleted. ${friendlyMessage(e)}` });
      setBusy(null);
    }
  }

  const settlementPreview = check.canFinalize
    ? settle(
        check.entries.map((e) => ({
          playerId: e.playerId,
          name: names.get(e.playerId) ?? '?',
          buyInCents: e.buyInCents,
          cashOutCents: e.cashOutCents,
        })),
      )
    : null;
  const finalizeReady = check.canFinalize && dateOk;
  const tallyTone = check.differenceCents === 0 ? 'balanced' : 'off';

  let saveStatus: ReactNode;
  if (saveState.kind === 'failed') {
    saveStatus = (
      <>
        <span className="loss">Not saved: {saveState.message}</span>
        <button type="button" className="btn small" onClick={() => void saveNow()}>
          Retry
        </button>
      </>
    );
  } else if (saveState.kind === 'saving' || (dirty && saveable)) {
    saveStatus = 'Saving…';
  } else if (dirty) {
    saveStatus = <span className="warn">Not saved: fix the problems above</span>;
  } else {
    saveStatus = 'All changes saved ✓';
  }

  return (
    <div className="entry-page">
      <Link to="/admin" className="back-link">
        ← Admin
      </Link>
      <h1>
        {formatGameDate(dateOk ? details.playedOn : game.playedOn)} <StatusBadge status="draft" />
      </h1>
      <p className="subtitle">
        In progress. Only admins can see it until you finalize. Changes save as you go.
      </p>

      <h2>Players</h2>
      <ul className="list">
        {lines.map((line, index) => (
          <EntryLineEditor
            key={line.key}
            line={line}
            index={index}
            check={check.lines[index]!}
            players={players}
            usedElsewhere={new Set(lines.filter((l) => l.key !== line.key && l.playerId).map((l) => l.playerId!))}
            visible={visible}
            touch={touch}
            onChange={(patch) => updateLine(line.key, patch)}
            onRemove={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
            onPlayerAdded={(player) => setPlayers((ps) => [...ps, player])}
          />
        ))}
      </ul>
      <div style={{ marginTop: 12 }}>
        <button type="button" className="btn block" onClick={addLine}>
          + Add a player
        </button>
      </div>

      {settlementPreview && (
        <>
          <h2>Settlement preview</h2>
          <SettlementPlan result={settlementPreview} />
        </>
      )}

      <h2>Game details</h2>
      <section className="card stack" aria-label="Game details">
        <div className="field">
          <label htmlFor="played-on">Date played</label>
          <input
            id="played-on"
            className="input"
            type="date"
            required
            value={details.playedOn}
            aria-invalid={!dateOk}
            onChange={(e) => setDetails({ ...details, playedOn: e.target.value })}
          />
          {!dateOk && <span className="field-error">Choose a date</span>}
        </div>
        <div className="field">
          <label htmlFor="location">Location (optional)</label>
          <input
            id="location"
            className="input"
            value={details.location}
            onChange={(e) => setDetails({ ...details, location: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="notes">Notes (optional)</label>
          <textarea
            id="notes"
            className="input"
            value={details.notes}
            onChange={(e) => setDetails({ ...details, notes: e.target.value })}
          />
        </div>
      </section>

      <div style={{ marginTop: 32 }}>
        <button type="button" className="btn danger small" onClick={deleteDraft} disabled={busy !== null}>
          {busy === 'delete' ? 'Deleting…' : 'Delete this game'}
        </button>
      </div>

      <div className={`tally ${tallyTone}`} role="region" aria-label="Running total">
        <div className="tally-inner">
          {message && <FlashBox flash={message} />}
          <div className="tally-numbers">
            <div>
              <small>Bought in</small>
              <Amount cents={check.totalInCents} />
            </div>
            <div>
              <small>Cashed out</small>
              <Amount cents={check.totalOutCents} />
            </div>
            <div>
              <small>Difference</small>
              <span className={`num ${check.differenceCents === 0 ? 'win' : 'warn'}`}>
                {formatSignedCents(check.differenceCents)}
              </span>
            </div>
          </div>
          <div className={`tally-status ${finalizeReady ? 'win' : 'warn'}`} aria-live="polite">
            {!dateOk ? 'Choose a date' : finalizeReady ? 'Balanced. Ready to finalize.' : check.finalizeBlocker}
          </div>
          <div className="tally-actions">
            <div className="save-status" aria-live="polite">
              {saveStatus}
            </div>
            <button
              type="button"
              className="btn primary"
              onClick={finalize}
              disabled={busy !== null || saveState.kind === 'saving' || !finalizeReady}
            >
              {busy === 'finalize' ? 'Finalizing…' : 'Finalize'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EntryLineEditor({
  line,
  index,
  check,
  players,
  usedElsewhere,
  visible,
  touch,
  onChange,
  onRemove,
  onPlayerAdded,
}: {
  line: SheetLine;
  index: number;
  check: LineCheck;
  players: Player[];
  usedElsewhere: Set<string>;
  visible: (field: string, error: string | null) => string | null;
  touch: (field: string) => void;
  onChange: (patch: Partial<SheetLine>) => void;
  onRemove: () => void;
  onPlayerAdded: (player: Player) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [rebuy, setRebuy] = useState<string | null>(null);
  const [rebuyError, setRebuyError] = useState<string | null>(null);
  const [addedNote, setAddedNote] = useState<string | null>(null);
  const id = line.key;
  const name = line.playerId ? (players.find((p) => p.id === line.playerId)?.name ?? 'this player') : 'this player';
  // A duplicate is shown right away; other problems once the field is left.
  const playerError =
    check.playerError && line.playerId ? check.playerError : visible(`${id}:player`, check.playerError);
  const buyInError = visible(`${id}:buyIn`, check.buyInError);
  const cashOutError = visible(`${id}:cashOut`, check.cashOutError);

  useEffect(() => {
    if (!addedNote) return;
    const timer = setTimeout(() => setAddedNote(null), 5000);
    return () => clearTimeout(timer);
  }, [addedNote]);

  function confirmRebuy() {
    const result = addToBuyIn(line.buyIn, rebuy ?? '');
    if (!result.ok) {
      setRebuyError(result.message);
      return;
    }
    onChange({ buyIn: result.text });
    setRebuy(null);
    setRebuyError(null);
    setAddedNote(`Added ${formatCents(result.addedCents)}`);
  }

  return (
    <li className="card entry-line" aria-label={`Line ${index + 1}`}>
      <div className="entry-line-head">
        {adding ? (
          <NewPlayerForm
            id={`${id}-new`}
            players={players}
            onDone={(player, created) => {
              if (created) onPlayerAdded(player);
              onChange({ playerId: player.id });
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <div className="field">
            <label htmlFor={`${id}-player`}>Player</label>
            <select
              id={`${id}-player`}
              className="input"
              value={line.playerId ?? ''}
              aria-invalid={playerError ? true : undefined}
              aria-describedby={playerError ? `${id}-player-error` : undefined}
              onChange={(e) => {
                if (e.target.value === NEW_PLAYER) {
                  setAdding(true);
                } else {
                  onChange({ playerId: e.target.value || null });
                }
              }}
              onBlur={() => touch(`${id}:player`)}
            >
              <option value="">Choose a player…</option>
              {players
                .filter((p) => p.active || p.id === line.playerId)
                .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
                .map((p) => (
                  <option key={p.id} value={p.id} disabled={usedElsewhere.has(p.id)}>
                    {p.name}
                    {usedElsewhere.has(p.id) ? ' (already in)' : ''}
                  </option>
                ))}
              <option value={NEW_PLAYER}>+ New player…</option>
            </select>
            {playerError && (
              <span id={`${id}-player-error`} className="field-error">
                {playerError}
              </span>
            )}
          </div>
        )}
        <button
          type="button"
          className="btn ghost remove-btn"
          onClick={onRemove}
          aria-label={`Remove line ${index + 1}`}
        >
          ×
        </button>
      </div>

      <div className="grid-2">
        <MoneyField
          id={`${id}-buyin`}
          label="Total buy-in"
          value={line.buyIn}
          error={buyInError}
          onChange={(buyIn) => onChange({ buyIn })}
          onBlur={() => touch(`${id}:buyIn`)}
        />
        <MoneyField
          id={`${id}-cashout`}
          label="Cash-out"
          placeholder="0"
          value={line.cashOut}
          error={cashOutError}
          onChange={(cashOut) => onChange({ cashOut })}
          onBlur={() => touch(`${id}:cashOut`)}
        />
      </div>

      {rebuy !== null ? (
        <div className="rebuy">
          <MoneyField
            id={`${id}-rebuy`}
            label={`Add a buy-in for ${name}`}
            value={rebuy}
            error={rebuyError}
            autoFocus
            onChange={(text) => {
              setRebuy(text);
              setRebuyError(null);
            }}
            onEnter={confirmRebuy}
          />
          <div className="rebuy-actions">
            <button type="button" className="btn ghost" onClick={() => setRebuy(null)}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={confirmRebuy}>
              Add
            </button>
          </div>
        </div>
      ) : (
        <div className="line-foot">
          <button
            type="button"
            className="btn small"
            aria-label={`Add a buy-in for ${name}`}
            onClick={() => {
              setRebuy(STANDARD_BUY_IN);
              setRebuyError(null);
            }}
          >
            + Buy-in
          </button>
          {addedNote && <span className="added-note">{addedNote}</span>}
          <span className="net">
            Net
            {check.netCents === null ? <span className="num muted">—</span> : <Net cents={check.netCents} />}
          </span>
        </div>
      )}
    </li>
  );
}
