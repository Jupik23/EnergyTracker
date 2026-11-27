import { describe, expect, it } from 'vitest';
import type { PriceSeries } from '@energy/core';
import { fromToday, needsCo2Refresh, needsPriceRefresh } from '../src/refresh';

const TZ = 'Europe/Warsaw';
const series = (fetchedAt: string, days: string[]): PriceSeries => ({
  unit: 'EUR/MWh',
  currency: 'EUR',
  source: 'test',
  fetchedAt,
  // 11:00 UTC is midday in Warsaw, safely inside each local day
  points: days.map((d) => ({ t: `${d}T11:00:00.000Z`, v: 100 })),
});

describe('needsPriceRefresh', () => {
  it('fetches when there is no cache', () => {
    expect(needsPriceRefresh(undefined, new Date('2026-11-27T08:00:00Z'), TZ)).toBe(true);
  });

  it('keeps a fresh cache that already covers today and tomorrow', () => {
    const prev = series('2026-11-27T13:00:00Z', ['2026-11-27', '2026-11-28']);
    expect(needsPriceRefresh(prev, new Date('2026-11-27T15:00:00Z'), TZ)).toBe(false);
  });

  it('polls every run in the afternoon until tomorrow is published', () => {
    const prev = series('2026-11-27T12:00:00Z', ['2026-11-27']);
    // 13:15 local
    expect(needsPriceRefresh(prev, new Date('2026-11-27T12:15:00Z'), TZ)).toBe(true);
    // 12:45 local: results not out yet, keep the cache
    expect(needsPriceRefresh(prev, new Date('2026-11-27T11:45:00Z'), TZ)).toBe(false);
  });

  it('does not poll for tomorrow in the morning', () => {
    const prev = series('2026-11-27T06:00:00Z', ['2026-11-27']);
    expect(needsPriceRefresh(prev, new Date('2026-11-27T08:00:00Z'), TZ)).toBe(false);
  });

  it('refreshes after midnight when the cache does not cover the new day', () => {
    const prev = series('2026-11-27T20:00:00Z', ['2026-11-27']);
    expect(needsPriceRefresh(prev, new Date('2026-11-27T23:30:00Z'), TZ)).toBe(true);
  });

  it('refreshes a cache older than 12 hours as a safety net', () => {
    const prev = series('2026-11-27T01:00:00Z', ['2026-11-27', '2026-11-28']);
    expect(needsPriceRefresh(prev, new Date('2026-11-27T12:30:00Z'), TZ)).toBe(false);
    expect(needsPriceRefresh(prev, new Date('2026-11-27T13:30:00Z'), TZ)).toBe(true);
  });
});

describe('needsCo2Refresh', () => {
  it('fetches when missing and never lets the forecast get older than 75 min', () => {
    const now = new Date('2026-11-27T12:00:00Z');
    expect(needsCo2Refresh(undefined, now, 'pl')).toBe(true);
    expect(needsCo2Refresh('2026-11-27T11:30:00Z', now, 'pl')).toBe(false);
    expect(needsCo2Refresh('2026-11-27T10:45:00Z', now, 'pl')).toBe(true);
  });

  it('spreads countries over the quarter-hour runs', () => {
    const fetchedAt = '2026-11-27T11:00:00Z';
    const countries = ['pl', 'de', 'fr', 'cz', 'se', 'it', 'es', 'at'];
    const runs = ['11:45', '12:00'].map((hm) => new Date(`2026-11-27T${hm}:00Z`));
    const due = runs.map((run) => countries.filter((c) => needsCo2Refresh(fetchedAt, run, c)).length);
    // each run refreshes only a subset, and none is skipped for more than an hour
    expect(due.every((n) => n < countries.length)).toBe(true);
    for (const c of countries) {
      const quarters = [0, 15, 30, 45].map((m) => new Date(Date.parse('2026-11-27T11:45:00Z') + m * 60_000));
      expect(quarters.some((q) => needsCo2Refresh(fetchedAt, q, c))).toBe(true);
    }
  });
});

describe('fromToday', () => {
  it('drops points from previous local days', () => {
    const pts = series('x', ['2026-11-26', '2026-11-27', '2026-11-28']).points;
    expect(fromToday(pts, new Date('2026-11-27T10:00:00Z'), TZ).map((p) => p.t.slice(0, 10))).toEqual([
      '2026-11-27',
      '2026-11-28',
    ]);
  });
});
