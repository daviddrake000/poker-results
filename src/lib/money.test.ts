import { describe, expect, it } from 'vitest';
import {
  MAX_CENTS,
  centsToInput,
  formatCents,
  formatSignedCents,
  netTone,
  parseDollars,
} from './money';

describe('parseDollars', () => {
  it.each([
    ['25', 2500],
    ['25.', 2500],
    ['25.5', 2550],
    ['25.50', 2550],
    ['25.05', 2505],
    ['.5', 50],
    ['.05', 5],
    ['0', 0],
    ['0.00', 0],
    ['007', 700],
    ['$25', 2500],
    ['$ 25', 2500],
    ['  25.00  ', 2500],
    ['1,000', 100000],
    ['1,000.25', 100025],
    ['12,345,678', 1234567800],
    ['21474836.47', MAX_CENTS],
  ])('reads %j as %i cents', (text, cents) => {
    expect(parseDollars(text)).toEqual({ kind: 'ok', cents });
  });

  it.each(['', '   ', '\t'])('reports %j as blank, not zero', (text) => {
    expect(parseDollars(text)).toEqual({ kind: 'blank' });
  });

  it.each([
    '$',
    '.',
    '$.',
    'abc',
    '2o',
    'O',
    '25.5.5',
    '25..5',
    '1e3',
    '0x10',
    'Infinity',
    'NaN',
    '25 00',
    '+5',
    '5-',
    '25$',
    '1,00',
    '1,0000',
    '10,00.00',
    ',100',
    '100,',
    '２５', // full-width digits
  ])('rejects %j instead of treating it as $0.00', (text) => {
    expect(parseDollars(text).kind).toBe('error');
  });

  it.each(['-5', '−5', '$-5', '-0'])('rejects negative %j', (text) => {
    expect(parseDollars(text)).toEqual({ kind: 'error', message: 'Amounts can’t be negative' });
  });

  it.each(['25.505', '1.000', '.123'])('rejects %j: more than 2 decimals is not certain', (text) => {
    expect(parseDollars(text)).toEqual({ kind: 'error', message: 'Use at most 2 decimal places' });
  });

  it.each(['21474836.48', '99999999', '123456789012345678901234567890'])(
    'rejects %j as too large for the database',
    (text) => {
      expect(parseDollars(text)).toEqual({ kind: 'error', message: 'That amount is too large' });
    },
  );

  it('never uses floating point to build cents', () => {
    // 0.1 + 0.2 style errors would turn 19.99 into 1998.9999…
    expect(parseDollars('19.99')).toEqual({ kind: 'ok', cents: 1999 });
    expect(parseDollars('0.29')).toEqual({ kind: 'ok', cents: 29 });
    expect(parseDollars('1.15')).toEqual({ kind: 'ok', cents: 115 });
  });
});

describe('formatCents', () => {
  it.each([
    [0, '$0.00'],
    [5, '$0.05'],
    [1500, '$15.00'],
    [150000, '$1,500.00'],
    [123456789, '$1,234,567.89'],
    [-1500, '−$15.00'],
    [-5, '−$0.05'],
  ])('shows %i cents as %s', (cents, text) => {
    expect(formatCents(cents)).toBe(text);
  });

  it('refuses non-integer cents rather than rounding them', () => {
    expect(() => formatCents(12.5)).toThrow();
    expect(() => formatCents(Number.NaN)).toThrow();
  });
});

describe('formatSignedCents', () => {
  it('marks winnings with + and losses with a minus sign', () => {
    expect(formatSignedCents(1500)).toBe('+$15.00');
    expect(formatSignedCents(-1500)).toBe('−$15.00');
    expect(formatSignedCents(0)).toBe('$0.00');
  });
});

describe('netTone', () => {
  it('classifies nets for colouring', () => {
    expect(netTone(1)).toBe('win');
    expect(netTone(-1)).toBe('loss');
    expect(netTone(0)).toBe('even');
  });
});

describe('centsToInput', () => {
  it.each([
    [0, '0'],
    [2500, '25'],
    [2550, '25.50'],
    [2505, '25.05'],
    [100000, '1000'],
  ])('turns %i cents into editable %j', (cents, text) => {
    expect(centsToInput(cents)).toBe(text);
  });

  it('round-trips through parseDollars', () => {
    for (const cents of [0, 1, 99, 100, 2505, 123456, MAX_CENTS]) {
      expect(parseDollars(centsToInput(cents))).toEqual({ kind: 'ok', cents });
    }
  });
});
