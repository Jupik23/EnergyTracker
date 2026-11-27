/**
 * Compact feed for smart-home controllers: `v1/<zone>/feed.json`.
 *
 * The full snapshot is ~100 kB (15-minute mix for the whole day); a Shelly
 * plug runs scripts in a few kB of RAM and Home Assistant only needs "now"
 * and the next hours. The feed is hourly, under ~4 kB, and has everything an
 * automation needs precomputed: the current price and CO₂ with a level, the
 * cheapest and cleanest windows of 1–4 hours, and the price ranking of the
 * current hour within the known horizon.
 *
 * Field names are short and stable — automations in the wild depend on them.
 * Additive changes only; anything breaking goes to `feed2.json`.
 */
import { bestWindows, type Point, type Window } from '@energy/core';

export const FEED_VERSION = 1;

/** The subset of a published snapshot the feed reads (works for v1 country and zone snapshots). */
export interface SnapshotLike {
  country: string;
  zone?: string;
  timezone: string;
  mix: { t: string; co2: number; renewableShare: number }[];
  prices: { currency: 'PLN' | 'EUR'; points: Point[] }[];
  /** Measured intensity from Energy-Charts (newer snapshots); preferred over the mix-derived value. */
  co2Measured?: Point[];
  co2Forecast: Point[];
}

export type Level = 'very_low' | 'low' | 'normal' | 'high' | 'very_high';

export interface FeedWindow {
  start: string;
  end: string;
  /** Average over the window: price per kWh, or g CO₂/kWh. */
  avg: number;
}

export interface Feed {
  v: typeof FEED_VERSION;
  zone: string;
  generatedAt: string;
  timezone: string;
  /** Wholesale day-ahead price per kWh (no distribution, margin or VAT). */
  currency: 'PLN' | 'EUR';
  now: {
    /** Start of the current hour. */
    t: string;
    price: number | null;
    priceLevel: Level | null;
    /** 0 = cheapest hour of the known horizon, 1 = most expensive. */
    priceRank: number | null;
    co2: number | null;
    co2Level: Level | null;
    renewableShare: number | null;
  };
  /** Hourly average price per kWh from the current hour on (today and, after ~13:00, tomorrow). */
  prices: { t: string; p: number }[];
  /** Hourly CO₂ (g/kWh): latest measurement, then forecast. */
  co2: { t: string; g: number }[];
  /** Best windows by duration in hours ("1".."4"), within the next 24 hours. */
  cheapest: Record<string, FeedWindow | null>;
  cleanest: Record<string, FeedWindow | null>;
}

const HOUR = 3_600_000;
const DURATIONS = [1, 2, 3, 4];

export function toHourly(points: Point[]): Point[] {
  const acc = new Map<number, { s: number; n: number }>();
  for (const p of points) {
    const h = Math.floor(Date.parse(p.t) / HOUR) * HOUR;
    const b = acc.get(h) ?? { s: 0, n: 0 };
    b.s += p.v;
    b.n++;
    acc.set(h, b);
  }
  return [...acc.entries()]
    .sort(([a], [b]) => a - b)
    .map(([h, b]) => ({ t: new Date(h).toISOString(), v: b.s / b.n }));
}

/** Position of `v` within `xs`, 0..1 (ties share the lower rank). */
export function rank(xs: number[], v: number): number {
  if (xs.length < 2) return 0;
  const below = xs.filter((x) => x < v).length;
  return below / (xs.length - 1);
}

/** Level relative to the known horizon: quintiles of the values themselves. */
export function levelOf(xs: number[], v: number): Level {
  const r = rank(xs, v);
  if (r < 0.2) return 'very_low';
  if (r < 0.4) return 'low';
  if (r < 0.6) return 'normal';
  if (r < 0.8) return 'high';
  return 'very_high';
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

function windows(points: Point[], now: Date, digits: number): Record<string, FeedWindow | null> {
  const out: Record<string, FeedWindow | null> = {};
  for (const h of DURATIONS) {
    const [w]: Window[] = bestWindows(points, {
      durationMinutes: h * 60,
      notBefore: now,
      notAfter: new Date(now.getTime() + 24 * HOUR),
      limit: 1,
    });
    out[String(h)] = w ? { start: w.start, end: w.end, avg: round(w.avg, digits) } : null;
  }
  return out;
}

export function buildFeed(s: SnapshotLike, now: Date): Feed {
  const hourStart = Math.floor(now.getTime() / HOUR) * HOUR;
  const series = s.prices[0];
  const perKwh = series
    ? toHourly(series.points)
        .map((p) => ({ t: p.t, v: p.v / 1000 }))
        .filter((p) => Date.parse(p.t) >= hourStart)
    : [];

  const measured = s.co2Measured?.length ? s.co2Measured : s.mix.map((m) => ({ t: m.t, v: m.co2 }));
  const lastMeasured = measured.at(-1);
  const lastMs = lastMeasured ? Date.parse(lastMeasured.t) : -Infinity;
  const co2Hourly = toHourly([
    ...measured.slice(-4),
    ...s.co2Forecast.filter((p) => Date.parse(p.t) > lastMs),
  ]).filter((p) => Date.parse(p.t) >= hourStart - 3 * HOUR);

  const priceNow = perKwh.find((p) => Date.parse(p.t) === hourStart)?.v ?? null;
  const priceValues = perKwh.map((p) => p.v);
  const co2Now = lastMeasured?.v ?? null;
  const co2Values = co2Hourly.map((p) => p.v);
  const lastMix = s.mix.at(-1);

  return {
    v: FEED_VERSION,
    zone: s.zone ?? s.country,
    generatedAt: now.toISOString(),
    timezone: s.timezone,
    currency: series?.currency ?? 'EUR',
    now: {
      t: new Date(hourStart).toISOString(),
      price: priceNow === null ? null : round(priceNow, 4),
      priceLevel: priceNow === null ? null : levelOf(priceValues, priceNow),
      priceRank: priceNow === null ? null : round(rank(priceValues, priceNow), 3),
      co2: co2Now,
      co2Level: co2Now === null || co2Values.length < 2 ? null : levelOf(co2Values, co2Now),
      renewableShare: lastMix?.renewableShare ?? null,
    },
    prices: perKwh.map((p) => ({ t: p.t, p: round(p.v, 4) })),
    co2: co2Hourly.map((p) => ({ t: p.t, g: Math.round(p.v) })),
    cheapest: windows(perKwh, now, 4),
    cleanest: windows(co2Hourly, now, 0),
  };
}
