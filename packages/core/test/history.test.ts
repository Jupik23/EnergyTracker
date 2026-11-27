import { describe, expect, it } from 'vitest';
import {
  buildHistoryMonth,
  dailyFromMonth,
  monthEnd,
  monthHours,
  monthRange,
  monthStartUtc,
  type MixPoint,
} from '../src';

const TZ = 'Europe/Warsaw';

/** 15-minute mix points for one local day, with solar only at noon-ish hours. */
function dayOfMix(date: string, utcOffsetHours: number): MixPoint[] {
  const start = Date.parse(`${date}T00:00:00Z`) - utcOffsetHours * 3_600_000;
  return Array.from({ length: 96 }, (_, i) => {
    const t = new Date(start + i * 900_000).toISOString();
    const hour = Math.floor(i / 4);
    const solar = hour >= 10 && hour < 14 ? 1000 : 0;
    return {
      t,
      mw: { coal: 1000, ...(solar ? { solar } : {}) },
      co2: solar ? 500 : 1000,
      renewableShare: solar ? 50 : 0,
    };
  });
}

describe('month helpers', () => {
  it('lists months across a year boundary', () => {
    expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('knows month ends, including leap years', () => {
    expect(monthEnd('2024-02')).toBe('2024-02-29');
    expect(monthEnd('2025-12')).toBe('2025-12-31');
  });

  it('finds local midnight of the 1st in summer and winter time', () => {
    expect(new Date(monthStartUtc('2025-05', TZ)).toISOString()).toBe('2025-04-30T22:00:00.000Z');
    expect(new Date(monthStartUtc('2025-01', TZ)).toISOString()).toBe('2024-12-31T23:00:00.000Z');
  });
});

describe('buildHistoryMonth', () => {
  const mix = [...dayOfMix('2025-05-01', 2), ...dayOfMix('2025-05-02', 2)];

  it('aggregates 15-minute points to hours aligned to local midnight', () => {
    const m = buildHistoryMonth('pl', '2025-05', TZ, mix);
    expect(m.t0).toBe('2025-04-30T22:00:00.000Z');
    expect(m.hours).toBe(48);
    expect(m.mw.coal).toHaveLength(48);
    expect(m.mw.solar![12]).toBe(1000); // 12:00 local
    expect(m.mw.solar![3]).toBe(0);
    expect(m.co2Source).toBe('computed');
  });

  it('prefers Energy-Charts CO2 when it covers the month', () => {
    const ec = mix.map((p) => ({ t: p.t, v: 42 }));
    const m = buildHistoryMonth('pl', '2025-05', TZ, mix, ec);
    expect(m.co2Source).toBe('energy-charts');
    expect(new Set(m.co2)).toEqual(new Set([42]));
  });

  it('ignores points outside the month', () => {
    const m = buildHistoryMonth('pl', '2025-05', TZ, [...dayOfMix('2025-04-30', 2), ...mix]);
    expect(m.hours).toBe(48);
  });

  it('leaves gaps as null', () => {
    const gappy = mix.filter((p) => !p.t.startsWith('2025-05-01T05'));
    const m = buildHistoryMonth('pl', '2025-05', TZ, gappy);
    const i = monthHours(m).indexOf('2025-05-01T05:00:00.000Z');
    expect(m.co2[i]).toBeNull();
    expect(m.mw.coal![i]).toBeNull();
  });
});

describe('dailyFromMonth', () => {
  it('averages per local day', () => {
    const m = buildHistoryMonth('pl', '2025-05', TZ, dayOfMix('2025-05-01', 2));
    const [day] = dailyFromMonth(m);
    expect(day!.d).toBe('2025-05-01');
    expect(day!.mw.coal).toBe(1000);
    expect(day!.mw.solar).toBe(Math.round((4 * 1000) / 24));
    expect(day!.co2).toBe(Math.round((20 * 1000 + 4 * 500) / 24));
  });

  it('skips days with less than 12 hours of data', () => {
    const half = dayOfMix('2025-05-01', 2).slice(0, 40); // 10 h
    expect(dailyFromMonth(buildHistoryMonth('pl', '2025-05', TZ, half))).toEqual([]);
  });
});
