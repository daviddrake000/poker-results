// `played_on` is a calendar date with no time zone. Never pass it to
// `new Date("YYYY-MM-DD")`, which reads it as UTC midnight and can show the
// previous day in the Americas.

function parts(isoDate: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new Error(`Not a calendar date: ${isoDate}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** "2026-10-16" → "Fri, Oct 16, 2026" */
export function formatGameDate(isoDate: string): string {
  const [y, m, d] = parts(isoDate);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Today's date where the admin is, as "YYYY-MM-DD". */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = parts(value);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}
