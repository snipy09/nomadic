/** Calendar-day helpers on `YYYY-MM-DD` strings (UTC arithmetic, no time zones). */

const DAY_MS = 86_400_000;

export function toDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseDay(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

export function addDays(day: string, n: number): string {
  return toDay(new Date(parseDay(day) + n * DAY_MS));
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(day: string): number {
  return new Date(parseDay(day)).getUTCDay();
}

export function isWeekend(day: string): boolean {
  const d = dayOfWeek(day);
  return d === 0 || d === 6;
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b) - parseDay(a)) / DAY_MS);
}

/** Every date from start to end, both included. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Local calendar day for a UTC offset in minutes (IST = 330). */
export function localToday(now: Date, tzOffsetMinutes = 0): string {
  return toDay(new Date(now.getTime() + tzOffsetMinutes * 60_000));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Tue 20 Oct". */
export function formatDay(day: string, withWeekday = true): string {
  const d = new Date(parseDay(day));
  const s = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return withWeekday ? `${WEEKDAYS[d.getUTCDay()]} ${s}` : s;
}
