import { describe, expect, it } from 'vitest';
import { bestWindows, inferIntervalMinutes, windowStartingAt, type Point } from '../src';

const H = 3_600_000;
const base = Date.parse('2026-11-28T00:00:00Z');
const hourly = (values: number[], startMs = base): Point[] =>
  values.map((v, i) => ({ t: new Date(startMs + i * H).toISOString(), v }));

describe('inferIntervalMinutes', () => {
  it('detects hourly and 15-minute series', () => {
    expect(inferIntervalMinutes(hourly([1, 2, 3]))).toBe(60);
    const q = [0, 1, 2, 3].map((i) => ({ t: new Date(base + i * 900_000).toISOString(), v: i }));
    expect(inferIntervalMinutes(q)).toBe(15);
  });
});

describe('bestWindows', () => {
  const prices = hourly([50, 40, 10, 20, 90, 5, 6, 100]);

  it('finds the cheapest 2-hour window first', () => {
    const [best] = bestWindows(prices, { durationMinutes: 120 });
    expect(best).toEqual({
      start: '2026-11-28T05:00:00.000Z',
      end: '2026-11-28T07:00:00.000Z',
      avg: 5.5,
    });
  });

  it('returns non-overlapping windows sorted by average', () => {
    const res = bestWindows(prices, { durationMinutes: 120, limit: 3 });
    expect(res.map((w) => w.avg)).toEqual([5.5, 15, 45]);
    expect(res[1]!.start).toBe('2026-11-28T02:00:00.000Z');
  });

  it('rounds partial durations up to whole intervals', () => {
    const [best] = bestWindows(prices, { durationMinutes: 90 });
    expect(best!.end).toBe('2026-11-28T07:00:00.000Z');
  });

  it('respects notBefore (no recommendations in the past)', () => {
    const [best] = bestWindows(prices, {
      durationMinutes: 60,
      notBefore: new Date(base + 6.5 * H),
    });
    // 06:30 floors to the 06:00 interval that is in progress
    expect(best!.start).toBe('2026-11-28T06:00:00.000Z');
  });

  it('respects notAfter (must finish by)', () => {
    const [best] = bestWindows(prices, { durationMinutes: 60, notAfter: new Date(base + 4 * H) });
    expect(best!.start).toBe('2026-11-28T02:00:00.000Z');
  });

  it('never bridges gaps in the data', () => {
    const gappy = [...hourly([1, 1]), ...hourly([1, 1], base + 5 * H)];
    const res = bestWindows(gappy, { durationMinutes: 180, limit: 5 });
    expect(res).toEqual([]);
  });

  it('handles empty input', () => {
    expect(bestWindows([], { durationMinutes: 60 })).toEqual([]);
  });
});

describe('windowStartingAt', () => {
  it('computes the "start now" baseline', () => {
    const prices = hourly([50, 40, 10, 20]);
    const w = windowStartingAt(prices, new Date(base + 1.25 * H), 120);
    expect(w).toEqual({
      start: '2026-11-28T01:00:00.000Z',
      end: '2026-11-28T03:00:00.000Z',
      avg: 25,
    });
  });

  it('returns null when data does not cover now', () => {
    expect(windowStartingAt(hourly([1, 2]), new Date(base + 10 * H), 60)).toBeNull();
  });
});
