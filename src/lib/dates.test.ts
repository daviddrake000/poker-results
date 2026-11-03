import { describe, expect, it } from 'vitest';
import { formatGameDate, isIsoDate, todayIso } from './dates';

describe('dates', () => {
  it('shows the calendar date as stored, without a time-zone shift', () => {
    expect(formatGameDate('2026-10-16')).toBe('Fri, Oct 16, 2026');
    expect(formatGameDate('2026-01-01')).toBe('Thu, Jan 1, 2026');
  });

  it('uses the local date for today', () => {
    expect(todayIso(new Date(2026, 9, 16, 23, 59))).toBe('2026-10-16');
    expect(todayIso(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });

  it('validates calendar dates', () => {
    expect(isIsoDate('2026-10-16')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('16/10/2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });
});
