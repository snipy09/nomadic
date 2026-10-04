import { describe, expect, it } from 'vitest';
import type { LearningEvent } from '@job-automator/learning';
import { buildHeatGrid, cellLabel, levelFor } from '../features/learn/heatmapLogic';

const IST = 330;
const NOW = new Date('2026-10-07T06:00:00Z'); // Wednesday 11:30 IST

const ev = (created_at: string, duration_s = 60, source = 'lesson'): LearningEvent =>
  ({ user_id: 'u1', type: 'lesson_completed', created_at, duration_s, payload: { source } }) as unknown as LearningEvent;

describe('heatmap grid', () => {
  it('has 26 Monday-first weeks ending in the current week, future days marked', () => {
    const g = buildHeatGrid([], NOW, IST);
    expect(g.weeks).toHaveLength(26);
    const last = g.weeks[25];
    expect(last[0].day).toBe('2026-10-05'); // Monday
    expect(last[2].day).toBe('2026-10-07');
    expect(last[2].future).toBe(false);
    expect(last[3].future).toBe(true);
    expect(g.activeDays).toBe(0);
    expect(g.months[0]).toBeTruthy();
  });

  it('counts events per local day and sets levels', () => {
    const events = [
      ev('2026-10-06T20:00:00Z', 600), // 01:30 IST on 7 Oct
      ev('2026-10-07T03:00:00Z', 600),
      ev('2026-10-05T10:00:00Z'),
      ev('2026-10-04T10:00:00Z', 60, 'legacy_import'),
    ];
    const g = buildHeatGrid(events, NOW, IST);
    const week = g.weeks[25];
    expect(week[2]).toMatchObject({ events: 2, minutes: 20, level: 2 });
    expect(week[0]).toMatchObject({ events: 1, level: 1 });
    expect(g.weeks[24][6].events).toBe(0); // legacy import ignored
    expect(g.activeDays).toBe(2);
    expect(g.totalMinutes).toBe(21);
  });

  it('labels cells for screen readers', () => {
    const g = buildHeatGrid([ev('2026-10-07T03:00:00Z', 300)], NOW, IST);
    expect(cellLabel(g.weeks[25][2])).toMatch(/7 Oct 2026: 1 activity, 5 min/);
    expect(cellLabel(g.weeks[25][1])).toMatch(/no activity/);
  });

  it('maps counts to levels', () => {
    expect([0, 1, 2, 3, 4, 6, 7, 20].map(levelFor)).toEqual([0, 1, 2, 2, 3, 3, 4, 4]);
  });
});
