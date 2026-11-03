// Money is integer cents everywhere. These are the only places that convert
// between cents and the dollar text a person types or reads.

/** Largest value the database's `integer` cents columns can hold. */
export const MAX_CENTS = 2_147_483_647;

export type ParsedAmount =
  | { kind: 'blank' }
  | { kind: 'ok'; cents: number }
  | { kind: 'error'; message: string };

// Accepts: 25  25.  25.5  25.50  .50  $25  $1,000  1,000.00
// Commas must be proper thousands groups, so "1,00" (a European decimal, or a
// typo) is rejected rather than guessed at.
const AMOUNT = /^\$?\s*((?:\d{1,3}(?:,\d{3})+)|\d+)?(?:\.(\d{0,2}))?$/;

/**
 * Parse a dollar amount typed by a person into cents.
 *
 * Never guesses: anything that isn't unambiguously a non-negative amount with
 * at most two decimal places is an error. A blank field is reported as
 * `blank` so the caller can decide what blank means (a blank cash-out is a
 * real $0.00; a blank buy-in is missing).
 */
export function parseDollars(text: string): ParsedAmount {
  const trimmed = text.trim();
  if (trimmed === '') return { kind: 'blank' };

  if (/^\$?\s*[-−]/.test(trimmed)) {
    return { kind: 'error', message: 'Amounts can’t be negative' };
  }

  if (/^\$?\s*[\d,]*\.\d{3,}$/.test(trimmed)) {
    return { kind: 'error', message: 'Use at most 2 decimal places' };
  }

  const match = AMOUNT.exec(trimmed);
  const whole = match?.[1];
  const fraction = match?.[2];
  // Reject "", "$", ".", "$." — a match with no digits at all.
  if (!match || (whole === undefined && (fraction === undefined || fraction === ''))) {
    return { kind: 'error', message: 'Not a dollar amount' };
  }

  const wholeDigits = (whole ?? '0').replace(/,/g, '');
  // Guard before converting so a huge digit string can't lose precision.
  if (wholeDigits.replace(/^0+/, '').length > 8) {
    return { kind: 'error', message: 'That amount is too large' };
  }
  const cents = Number(wholeDigits) * 100 + Number((fraction ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) {
    return { kind: 'error', message: 'That amount is too large' };
  }
  return { kind: 'ok', cents };
}

function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`Expected integer cents, got ${cents}`);
  }
}

/** 150000 → "$1,500.00"; -1500 → "−$15.00" (true minus sign). */
export function formatCents(cents: number): string {
  assertCents(cents);
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const rest = String(abs % 100).padStart(2, '0');
  return `${cents < 0 ? '−' : ''}$${dollars}.${rest}`;
}

/** Like formatCents but marks winnings with "+": 1500 → "+$15.00". */
export function formatSignedCents(cents: number): string {
  return cents > 0 ? `+${formatCents(cents)}` : formatCents(cents);
}

/** "win", "loss" or "even" — used to colour a net amount. */
export function netTone(cents: number): 'win' | 'loss' | 'even' {
  return cents > 0 ? 'win' : cents < 0 ? 'loss' : 'even';
}

/** Cents back into editable text: 2500 → "25", 2550 → "25.50". */
export function centsToInput(cents: number): string {
  assertCents(cents);
  const dollars = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(dollars) : `${dollars}.${String(rest).padStart(2, '0')}`;
}
