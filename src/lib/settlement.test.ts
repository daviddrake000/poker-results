import { describe, expect, it } from 'vitest';
import { describePayment, settle, type Payment, type SettlementEntry } from './settlement';

function entry(name: string, buyInDollars: number, cashOutDollars: number): SettlementEntry {
  return {
    playerId: `id-${name}`,
    name,
    buyInCents: Math.round(buyInDollars * 100),
    cashOutCents: Math.round(cashOutDollars * 100),
  };
}

function plan(entries: SettlementEntry[]): Payment[] {
  const result = settle(entries);
  if (!result.ok) throw new Error(`expected a plan, got ${JSON.stringify(result)}`);
  return result.payments;
}

function sentences(entries: SettlementEntry[]): string[] {
  return plan(entries).map(describePayment);
}

// Small seeded PRNG so the randomised checks are repeatable.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** A random game where chips are conserved. */
function randomBalancedGame(rand: () => number): SettlementEntry[] {
  const n = 2 + Math.floor(rand() * 9); // 2–10 players
  const names = shuffle(['Ann', 'Ben', 'Cat', 'Dev', 'Eve', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jon'], rand)
    .slice(0, n);
  const buyIns = names.map(() => (1 + Math.floor(rand() * 20)) * 500 + Math.floor(rand() * 3) * 25);
  const pot = buyIns.reduce((a, b) => a + b, 0);

  // Split the pot at random cut points, so some players bust (cash out 0).
  const cuts = names.slice(1).map(() => Math.floor(rand() * (pot + 1))).sort((a, b) => a - b);
  const bounds = [0, ...cuts, pot];
  return names.map((name, i) => ({
    playerId: `id-${name}`,
    name,
    buyInCents: buyIns[i]!,
    cashOutCents: bounds[i + 1]! - bounds[i]!,
  }));
}

describe('settle — acceptance criteria', () => {
  it('Ann +$15, Ben −$15 → one payment: Ben pays Ann $15.00', () => {
    expect(sentences([entry('Ann', 20, 35), entry('Ben', 20, 5)])).toEqual(['Ben pays Ann $15.00']);
  });

  it('everyone breaks even → no payments', () => {
    expect(plan([entry('Ann', 20, 20), entry('Ben', 50, 50), entry('Cat', 0, 0)])).toEqual([]);
  });

  it('no players → no payments', () => {
    expect(plan([])).toEqual([]);
  });

  it('n players → at most n − 1 payments', () => {
    const rand = mulberry32(1);
    for (let i = 0; i < 500; i++) {
      const game = randomBalancedGame(rand);
      expect(plan(game).length).toBeLessThanOrEqual(game.length - 1);
    }
  });

  it('a re-buy is treated as a larger buy-in', () => {
    // Ben buys in $20, busts, re-buys $20 and cashes out $5.
    const asTwoRows = [entry('Ann', 20, 55), entry('Ben', 20, 0), entry('Ben', 20, 5)];
    const asOneRow = [entry('Ann', 20, 55), entry('Ben', 40, 5)];
    expect(sentences(asTwoRows)).toEqual(['Ben pays Ann $35.00']);
    expect(plan(asTwoRows)).toEqual(plan(asOneRow));
  });

  it('a game that doesn’t balance gets no plan', () => {
    expect(settle([entry('Ann', 20, 35), entry('Ben', 20, 10)])).toEqual({
      ok: false,
      reason: 'unbalanced',
      offByCents: 500,
    });
    expect(settle([entry('Ann', 20, 30), entry('Ben', 20, 5)])).toEqual({
      ok: false,
      reason: 'unbalanced',
      offByCents: -500,
    });
  });

  it('is off even by a single cent → no plan', () => {
    const result = settle([entry('Ann', 20, 35), entry('Ben', 20, 5.01)]);
    expect(result).toEqual({ ok: false, reason: 'unbalanced', offByCents: 1 });
  });

  it('same game, players in a different order → identical plan', () => {
    const rand = mulberry32(2);
    for (let i = 0; i < 300; i++) {
      const game = randomBalancedGame(rand);
      const expected = plan(game);
      for (let k = 0; k < 5; k++) {
        expect(plan(shuffle(game, rand))).toEqual(expected);
      }
    }
  });

  it('any balanced game → each player’s payments in and out add up to exactly their net', () => {
    const rand = mulberry32(3);
    for (let i = 0; i < 500; i++) {
      const game = randomBalancedGame(rand);
      const settled = new Map<string, number>();
      for (const p of plan(game)) {
        expect(Number.isSafeInteger(p.cents)).toBe(true);
        expect(p.cents).toBeGreaterThan(0);
        expect(p.fromId).not.toBe(p.toId);
        settled.set(p.toId, (settled.get(p.toId) ?? 0) + p.cents);
        settled.set(p.fromId, (settled.get(p.fromId) ?? 0) - p.cents);
      }
      for (const e of game) {
        expect(settled.get(e.playerId) ?? 0).toBe(e.cashOutCents - e.buyInCents);
      }
    }
  });
});

describe('settle — details', () => {
  it('settles the largest debtor against the largest creditor first', () => {
    // Nets: Ann +40, Ben +10, Cat −30, Dev −20
    const game = [entry('Ann', 20, 60), entry('Ben', 20, 30), entry('Cat', 40, 10), entry('Dev', 30, 10)];
    expect(sentences(game)).toEqual([
      'Cat pays Ann $30.00',
      'Dev pays Ann $10.00',
      'Dev pays Ben $10.00',
    ]);
  });

  it('breaks ties by name', () => {
    // Ann and Ben both +10, Cat and Dev both −10.
    const game = [entry('Dev', 20, 10), entry('Ben', 20, 30), entry('Cat', 20, 10), entry('Ann', 20, 30)];
    expect(sentences(game)).toEqual(['Cat pays Ann $10.00', 'Dev pays Ben $10.00']);
  });

  it('keeps exact cents', () => {
    const game = [entry('Ann', 20, 20.01), entry('Ben', 20.01, 20)];
    expect(sentences(game)).toEqual(['Ben pays Ann $0.01']);
  });

  it('leaves players who broke even out of the plan', () => {
    const game = [entry('Ann', 20, 35), entry('Ben', 20, 5), entry('Cat', 50, 50)];
    expect(sentences(game)).toEqual(['Ben pays Ann $15.00']);
  });

  it('refuses amounts that aren’t whole, non-negative cents', () => {
    const fractional = { playerId: 'a', name: 'Ann', buyInCents: 10.5, cashOutCents: 10.5 };
    const negative = { playerId: 'b', name: 'Ben', buyInCents: -100, cashOutCents: -100 };
    expect(settle([fractional]).ok).toBe(false);
    expect(settle([negative]).ok).toBe(false);
  });

  it('formats a payment as a plain sentence', () => {
    expect(describePayment({ fromId: 'b', from: 'Ben', toId: 'a', to: 'Ann', cents: 123456 })).toBe(
      'Ben pays Ann $1,234.56',
    );
  });
});
