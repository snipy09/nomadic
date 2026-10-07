/** Activity heatmap for Learn: one cell per local day, columns are weeks (Monday first). */
import { heatmap, localDay, type LearningEvent } from '@job-automator/learning';

export interface HeatCell {
  day: string; // YYYY-MM-DD (local)
  events: number;
  minutes: number;
  /** 0 = nothing, 1..4 = more activity. */
  level: 0 | 1 | 2 | 3 | 4;
  future: boolean;
}

export interface HeatGrid {
  weeks: HeatCell[][];
  /** Month label per week column, set on the first column of each month. */
  months: Array<string | null>;
  activeDays: number;
  totalMinutes: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Level from the number of events that day: 1, 2–3, 4–6, 7+. */
export function levelFor(events: number): HeatCell['level'] {
  if (events <= 0) return 0;
  if (events === 1) return 1;
  if (events <= 3) return 2;
  if (events <= 6) return 3;
  return 4;
}

export function buildHeatGrid(events: LearningEvent[], now: Date, tzOffsetMinutes: number, weeks = 26): HeatGrid {
  const byDay = heatmap(events, tzOffsetMinutes);
  const today = localDay(now.toISOString(), tzOffsetMinutes);
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const start = addDays(today, -weekday - (weeks - 1) * 7);
  const grid: HeatCell[][] = [];
  const months: Array<string | null> = [];
  let activeDays = 0;
  let seconds = 0;
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const day = addDays(start, w * 7 + d);
      const hit = byDay.get(day);
      const future = day > today;
      if (hit && !future) {
        activeDays++;
        seconds += hit.seconds;
      }
      col.push({ day, events: hit?.events ?? 0, minutes: Math.round((hit?.seconds ?? 0) / 60), level: future ? 0 : levelFor(hit?.events ?? 0), future });
    }
    const month = Number(col[0].day.slice(5, 7)) - 1;
    months.push(month !== lastMonth ? MONTHS[month] : null);
    lastMonth = month;
    grid.push(col);
  }
  return { weeks: grid, months, activeDays, totalMinutes: Math.round(seconds / 60) };
}

export function cellLabel(c: HeatCell): string {
  const date = new Date(`${c.day}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  if (c.future) return date;
  if (!c.events) return `${date}: no activity`;
  return `${date}: ${c.events} ${c.events === 1 ? 'activity' : 'activities'}${c.minutes ? `, ${c.minutes} min` : ''}`;
}
