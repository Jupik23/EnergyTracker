import { describe, expect, it } from 'vitest';
import { buildFeed, levelOf, rank, type SnapshotLike } from '../src/feed/build';

const H = 3_600_000;
const t0 = Date.parse('2026-11-27T00:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

function snapshot(): SnapshotLike {
  // 15-minute prices for 24 h: cheap at 02:00–04:00 UTC, expensive at 17:00.
  const prices = Array.from({ length: 96 }, (_, i) => {
    const hour = Math.floor(i / 4);
    const v = hour >= 2 && hour < 4 ? 100 : hour === 17 ? 900 : 400;
    return { t: iso(t0 + i * 15 * 60_000), v };
  });
  return {
    country: 'pl',
    timezone: 'Europe/Warsaw',
    mix: [{ t: iso(t0 + 45 * 60_000), co2: 700, renewableShare: 20 }],
    prices: [{ currency: 'PLN', points: prices }],
    co2Forecast: Array.from({ length: 24 }, (_, h) => ({
      t: iso(t0 + (h + 1) * H),
      v: h === 12 ? 300 : 650,
    })),
  };
}

describe('buildFeed', () => {
  const feed = buildFeed(snapshot(), new Date(t0 + 30 * 60_000));

  it('reports the current hour in price per kWh', () => {
    expect(feed.zone).toBe('pl');
    expect(feed.now.t).toBe(iso(t0));
    expect(feed.now.price).toBe(0.4);
    expect(feed.prices).toHaveLength(24);
    expect(feed.prices[2]).toEqual({ t: iso(t0 + 2 * H), p: 0.1 });
  });

  it('finds the cheapest and cleanest windows', () => {
    expect(feed.cheapest['2']).toEqual({ start: iso(t0 + 2 * H), end: iso(t0 + 4 * H), avg: 0.1 });
    expect(feed.cheapest['1']!.start).toBe(iso(t0 + 2 * H));
    expect(feed.cleanest['1']).toEqual({ start: iso(t0 + 13 * H), end: iso(t0 + 14 * H), avg: 300 });
  });

  it('stays small enough for a Shelly script', () => {
    expect(JSON.stringify(feed).length).toBeLessThan(6_000);
  });
});

describe('rank / levelOf', () => {
  it('ranks within the horizon', () => {
    const xs = [1, 2, 3, 4, 5];
    expect(rank(xs, 1)).toBe(0);
    expect(rank(xs, 5)).toBe(1);
    expect(levelOf(xs, 1)).toBe('very_low');
    expect(levelOf(xs, 3)).toBe('normal');
    expect(levelOf(xs, 5)).toBe('very_high');
  });
});
