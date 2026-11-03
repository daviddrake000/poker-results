import { describe, expect, it } from 'vitest';
import { addToBuyIn, checkSheet, describeDifference, type SheetLine } from './sheet';

const names = new Map([
  ['a', 'Ann'],
  ['b', 'Ben'],
  ['c', 'Cat'],
]);

let n = 0;
function line(playerId: string | null, buyIn: string, cashOut: string): SheetLine {
  return { key: `k${n++}`, playerId, buyIn, cashOut };
}

describe('checkSheet', () => {
  it('balances Ann and Ben and allows Finalize', () => {
    const check = checkSheet([line('a', '20', '35'), line('b', '20', '5')], names);
    expect(check.totalInCents).toBe(4000);
    expect(check.totalOutCents).toBe(4000);
    expect(check.differenceCents).toBe(0);
    expect(check.canSave).toBe(true);
    expect(check.canFinalize).toBe(true);
    expect(check.finalizeBlocker).toBeNull();
    expect(check.entries).toEqual([
      { playerId: 'a', buyInCents: 2000, cashOutCents: 3500 },
      { playerId: 'b', buyInCents: 2000, cashOutCents: 500 },
    ]);
    expect(check.lines.map((l) => l.netCents)).toEqual([1500, -1500]);
  });

  it('treats a blank cash-out as a real $0.00', () => {
    const check = checkSheet([line('a', '20', '40'), line('b', '20', '')], names);
    expect(check.canFinalize).toBe(true);
    expect(check.entries[1]).toEqual({ playerId: 'b', buyInCents: 2000, cashOutCents: 0 });
  });

  it('does not treat a typo as zero: it blocks saving and is left out of the totals', () => {
    const check = checkSheet([line('a', '20', '4o'), line('b', '20', '')], names);
    expect(check.lines[0]!.cashOutError).toBe('Not a dollar amount');
    expect(check.lines[0]!.cashOutCents).toBeNull();
    expect(check.lines[0]!.netCents).toBeNull();
    expect(check.totalOutCents).toBe(0);
    expect(check.canSave).toBe(false);
    expect(check.canFinalize).toBe(false);
    expect(check.finalizeBlocker).toBe('Fix the problem above first');
  });

  it('requires a buy-in', () => {
    const check = checkSheet([line('a', '', '20'), line('b', '20', '20')], names);
    expect(check.lines[0]!.buyInError).toBe('Enter a buy-in');
    expect(check.canSave).toBe(false);
  });

  it('requires a player on every line', () => {
    const check = checkSheet([line(null, '20', '20'), line('b', '20', '20')], names);
    expect(check.lines[0]!.playerError).toBe('Choose a player');
    expect(check.canSave).toBe(false);
  });

  it('rejects the same player on two lines (the database allows one row per player)', () => {
    const check = checkSheet([line('a', '20', '0'), line('a', '20', '40')], names);
    expect(check.lines[0]!.playerError).toMatch(/^Ann is on more than one line/);
    expect(check.lines[1]!.playerError).toMatch(/^Ann is on more than one line/);
    expect(check.problemCount).toBe(2);
    expect(check.finalizeBlocker).toBe('Fix the 2 problems above first');
  });

  it('keeps a live total while unbalanced and says which way it is off', () => {
    const check = checkSheet([line('a', '20', '35'), line('b', '20', '10')], names);
    expect(check.canSave).toBe(true);
    expect(check.differenceCents).toBe(500);
    expect(check.canFinalize).toBe(false);
    expect(check.finalizeBlocker).toBe('Cash-outs are $5.00 more than buy-ins');
  });

  it('needs at least 2 players to finalize', () => {
    const check = checkSheet([line('a', '20', '20')], names);
    expect(check.canSave).toBe(true);
    expect(check.canFinalize).toBe(false);
    expect(check.finalizeBlocker).toBe('Add at least 2 players');
  });

  it('allows an empty sheet to be saved but not finalized', () => {
    const check = checkSheet([], names);
    expect(check.canSave).toBe(true);
    expect(check.canFinalize).toBe(false);
  });
});

describe('addToBuyIn', () => {
  it('adds a re-buy to the total: $30 then $15 for Hal is $45', () => {
    expect(addToBuyIn('30', '15')).toEqual({ ok: true, text: '45', addedCents: 1500 });
  });

  it('keeps exact cents', () => {
    expect(addToBuyIn('30', '12.50')).toEqual({ ok: true, text: '42.50', addedCents: 1250 });
    expect(addToBuyIn('0.10', '0.20')).toEqual({ ok: true, text: '0.30', addedCents: 20 });
  });

  it('treats a blank total as nothing bought yet', () => {
    expect(addToBuyIn('', '30')).toEqual({ ok: true, text: '30', addedCents: 3000 });
  });

  it('refuses to add to a total that doesn’t parse', () => {
    expect(addToBuyIn('3o', '15')).toEqual({ ok: false, message: 'Fix this line’s buy-in first' });
  });

  it('refuses an amount that isn’t certain, or is zero', () => {
    expect(addToBuyIn('30', '1o')).toEqual({ ok: false, message: 'Not a dollar amount' });
    expect(addToBuyIn('30', '-15')).toEqual({ ok: false, message: 'Amounts can’t be negative' });
    expect(addToBuyIn('30', '')).toEqual({ ok: false, message: 'Enter an amount above $0.00' });
    expect(addToBuyIn('30', '0')).toEqual({ ok: false, message: 'Enter an amount above $0.00' });
  });

  it('refuses a total too large for the database', () => {
    expect(addToBuyIn('21474836', '1')).toEqual({ ok: false, message: 'That amount is too large' });
  });
});

describe('describeDifference', () => {
  it('describes the direction of an imbalance', () => {
    expect(describeDifference(0)).toBe('Balanced');
    expect(describeDifference(1)).toBe('Cash-outs are $0.01 more than buy-ins');
    expect(describeDifference(-2500)).toBe('Cash-outs are $25.00 less than buy-ins');
  });
});
