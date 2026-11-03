import { MAX_CENTS, centsToInput, formatCents, parseDollars, type ParsedAmount } from './money';

/** One line of the game-entry screen, exactly as typed. */
export interface SheetLine {
  key: string;
  playerId: string | null;
  buyIn: string;
  cashOut: string;
}

export interface LineCheck {
  key: string;
  playerError: string | null;
  buyInError: string | null;
  cashOutError: string | null;
  /** Null when the amount isn't usable yet. */
  buyInCents: number | null;
  cashOutCents: number | null;
  netCents: number | null;
}

export interface SheetEntry {
  playerId: string;
  buyInCents: number;
  cashOutCents: number;
}

export interface SheetCheck {
  lines: LineCheck[];
  totalInCents: number;
  totalOutCents: number;
  /** Cash-outs minus buy-ins. Zero means the night balances. */
  differenceCents: number;
  problemCount: number;
  /** No problems on any line, so the sheet can be saved as a draft. */
  canSave: boolean;
  canFinalize: boolean;
  /** Why Finalize is disabled, in plain words. Null when it isn't. */
  finalizeBlocker: string | null;
  /** The rows to store. Only meaningful when canSave is true. */
  entries: SheetEntry[];
}

function amountError(parsed: ParsedAmount, blankMessage: string | null): string | null {
  if (parsed.kind === 'error') return parsed.message;
  if (parsed.kind === 'blank') return blankMessage;
  return null;
}

export type AddBuyInResult =
  | { ok: true; text: string; addedCents: number }
  | { ok: false; message: string };

/**
 * Add another buy-in (a re-buy) to a line's buy-in total.
 * A blank total counts as nothing bought yet; a total that doesn't parse is
 * left alone rather than guessed at.
 */
export function addToBuyIn(currentText: string, amountText: string): AddBuyInResult {
  const current = parseDollars(currentText);
  if (current.kind === 'error') return { ok: false, message: 'Fix this line’s buy-in first' };
  const amount = parseDollars(amountText);
  if (amount.kind === 'error') return { ok: false, message: amount.message };
  if (amount.kind === 'blank' || amount.cents === 0) {
    return { ok: false, message: 'Enter an amount above $0.00' };
  }
  const total = (current.kind === 'ok' ? current.cents : 0) + amount.cents;
  if (total > MAX_CENTS) return { ok: false, message: 'That amount is too large' };
  return { ok: true, text: centsToInput(total), addedCents: amount.cents };
}

/** Describe an off-balance difference the way an admin would say it. */
export function describeDifference(differenceCents: number): string {
  if (differenceCents === 0) return 'Balanced';
  const amount = formatCents(Math.abs(differenceCents));
  return differenceCents > 0
    ? `Cash-outs are ${amount} more than buy-ins`
    : `Cash-outs are ${amount} less than buy-ins`;
}

/**
 * Check every line and total the night up.
 *
 * A blank cash-out is a real $0.00 (the player busted). A blank buy-in, an
 * unparseable amount, a missing player or a player on two lines are problems
 * that block saving. Totals include only the amounts that parsed, so the
 * running total stays live while the admin is still typing.
 */
export function checkSheet(
  lines: readonly SheetLine[],
  playerNames: ReadonlyMap<string, string>,
): SheetCheck {
  const seen = new Map<string, number>();
  for (const line of lines) {
    if (line.playerId) seen.set(line.playerId, (seen.get(line.playerId) ?? 0) + 1);
  }

  let totalInCents = 0;
  let totalOutCents = 0;
  let problemCount = 0;
  const entries: SheetEntry[] = [];

  const checked = lines.map((line): LineCheck => {
    const buyIn = parseDollars(line.buyIn);
    const cashOut = parseDollars(line.cashOut);
    const buyInCents = buyIn.kind === 'ok' ? buyIn.cents : null;
    const cashOutCents = cashOut.kind === 'ok' ? cashOut.cents : cashOut.kind === 'blank' ? 0 : null;

    let playerError: string | null = null;
    if (!line.playerId) {
      playerError = 'Choose a player';
    } else if ((seen.get(line.playerId) ?? 0) > 1) {
      const name = playerNames.get(line.playerId) ?? 'This player';
      playerError = `${name} is on more than one line. Put re-buys in one buy-in.`;
    }
    const buyInError = amountError(buyIn, 'Enter a buy-in');
    const cashOutError = amountError(cashOut, null);

    for (const error of [playerError, buyInError, cashOutError]) {
      if (error) problemCount++;
    }
    if (buyInCents !== null) totalInCents += buyInCents;
    if (cashOutCents !== null) totalOutCents += cashOutCents;
    if (line.playerId && buyInCents !== null && cashOutCents !== null) {
      entries.push({ playerId: line.playerId, buyInCents, cashOutCents });
    }

    return {
      key: line.key,
      playerError,
      buyInError,
      cashOutError,
      buyInCents,
      cashOutCents,
      netCents: buyInCents !== null && cashOutCents !== null ? cashOutCents - buyInCents : null,
    };
  });

  const differenceCents = totalOutCents - totalInCents;
  const canSave = problemCount === 0;

  let finalizeBlocker: string | null = null;
  if (!canSave) {
    finalizeBlocker = problemCount === 1 ? 'Fix the problem above first' : `Fix the ${problemCount} problems above first`;
  } else if (lines.length < 2) {
    finalizeBlocker = 'Add at least 2 players';
  } else if (differenceCents !== 0) {
    finalizeBlocker = describeDifference(differenceCents);
  }

  return {
    lines: checked,
    totalInCents,
    totalOutCents,
    differenceCents,
    problemCount,
    canSave,
    canFinalize: finalizeBlocker === null,
    finalizeBlocker,
    entries,
  };
}
