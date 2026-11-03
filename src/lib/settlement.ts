import { formatCents } from './money';

export interface SettlementEntry {
  playerId: string;
  name: string;
  buyInCents: number;
  cashOutCents: number;
}

export interface Payment {
  fromId: string;
  from: string;
  toId: string;
  to: string;
  cents: number;
}

export type SettlementResult =
  | { ok: true; payments: Payment[] }
  | { ok: false; reason: 'unbalanced'; offByCents: number }
  | { ok: false; reason: 'invalid'; message: string };

interface Balance {
  playerId: string;
  name: string;
  /** Positive: owed money. Negative: owes money. */
  cents: number;
}

// Deterministic on every device: plain code-unit comparison, not locale rules.
function byNameThenId(a: Balance, b: Balance): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  if (a.playerId !== b.playerId) return a.playerId < b.playerId ? -1 : 1;
  return 0;
}

function isCents(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0;
}

/**
 * Work out who pays whom so everyone ends up square.
 *
 * Greedy: repeatedly settle the largest debtor against the largest creditor,
 * breaking ties by name. Each payment clears at least one player, so n players
 * need at most n − 1 payments. Several entries for the same player (re-buys)
 * are added together. An unbalanced game gets no plan at all.
 */
export function settle(entries: readonly SettlementEntry[]): SettlementResult {
  const balances = new Map<string, Balance>();
  let totalIn = 0;
  let totalOut = 0;

  for (const e of entries) {
    if (!isCents(e.buyInCents) || !isCents(e.cashOutCents)) {
      return { ok: false, reason: 'invalid', message: `${e.name} has an amount that isn’t whole cents` };
    }
    totalIn += e.buyInCents;
    totalOut += e.cashOutCents;
    const existing = balances.get(e.playerId);
    if (existing && existing.name !== e.name) {
      return { ok: false, reason: 'invalid', message: `Player ${e.playerId} appears under two names` };
    }
    const balance = existing ?? { playerId: e.playerId, name: e.name, cents: 0 };
    balance.cents += e.cashOutCents - e.buyInCents;
    balances.set(e.playerId, balance);
  }

  if (totalOut !== totalIn) {
    return { ok: false, reason: 'unbalanced', offByCents: totalOut - totalIn };
  }

  const debtors = [...balances.values()].filter((b) => b.cents < 0);
  const creditors = [...balances.values()].filter((b) => b.cents > 0);
  const largestFirst = (a: Balance, b: Balance) =>
    Math.abs(b.cents) - Math.abs(a.cents) || byNameThenId(a, b);

  const payments: Payment[] = [];
  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort(largestFirst);
    creditors.sort(largestFirst);
    const debtor = debtors[0]!;
    const creditor = creditors[0]!;
    const cents = Math.min(-debtor.cents, creditor.cents);

    payments.push({
      fromId: debtor.playerId,
      from: debtor.name,
      toId: creditor.playerId,
      to: creditor.name,
      cents,
    });
    debtor.cents += cents;
    creditor.cents -= cents;
    if (debtor.cents === 0) debtors.shift();
    if (creditor.cents === 0) creditors.shift();
  }

  return { ok: true, payments };
}

/** "Ben pays Ann $15.00" */
export function describePayment(p: Payment): string {
  return `${p.from} pays ${p.to} ${formatCents(p.cents)}`;
}
