/**
 * Hourly training history from Energy-Charts: day-ahead prices (EUR/MWh) and
 * carbon intensity (g/kWh).
 */
import { toMixPoint } from '@energy/core';
import { fetchJson } from '../http';
import { floorHour } from './calendar';

const BASE = 'https://api.energy-charts.info';

interface V2Response {
  data: { timestamp: string; values: Record<string, number | null> }[];
}

type Fetcher = <T>(url: string) => Promise<T>;

/** hour (UTC ms) -> value */
export type HourlySeries = Map<number, number>;

/** Averages sub-hourly points (15-min prices since Oct 2025) into hourly buckets. */
export function toHourlySeries(points: { t: number; v: number }[]): HourlySeries {
  const acc = new Map<number, { s: number; n: number }>();
  for (const p of points) {
    if (!Number.isFinite(p.v)) continue;
    const h = floorHour(p.t);
    const b = acc.get(h) ?? { s: 0, n: 0 };
    b.s += p.v;
    b.n += 1;
    acc.set(h, b);
  }
  return new Map([...acc].map(([h, b]) => [h, b.s / b.n]));
}

/** Monthly [start, end] date ranges covering [start, end] — Energy-Charts caps response sizes. */
export function monthChunks(start: string, end: string): [string, string][] {
  const out: [string, string][] = [];
  let cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cur <= last) {
    const next = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    const chunkEnd = new Date(Math.min(next.getTime() - 86_400_000, last.getTime()));
    out.push([cur.toISOString().slice(0, 10), chunkEnd.toISOString().slice(0, 10)]);
    cur = next;
  }
  return out;
}

export async function fetchPriceHistory(
  biddingZone: string,
  start: string,
  end: string,
  get: Fetcher = fetchJson,
  pause: () => Promise<void> = async () => {},
): Promise<HourlySeries> {
  const points: { t: number; v: number }[] = [];
  // Prices are small (one value per interval), a quarter per request is fine.
  const chunks = monthChunks(start, end);
  for (let i = 0; i < chunks.length; i += 3) {
    const from = chunks[i]![0];
    const to = chunks[Math.min(i + 2, chunks.length - 1)]![1];
    if (i > 0) await pause();
    const json = await get<V2Response>(`${BASE}/v2/price?bzn=${biddingZone}&start=${from}&end=${to}`);
    for (const d of json.data) {
      const v = d.values.day_ahead_price;
      if (typeof v === 'number') points.push({ t: Date.parse(d.timestamp), v });
    }
  }
  return toHourlySeries(points);
}

interface Co2EqResponse {
  unix_seconds: number[];
  co2eq?: (number | null)[];
}

/**
 * Measured carbon intensity from Energy-Charts (`/co2eq`) — the same series
 * the app shows as "measured", so the forecast continues it without a jump.
 * Falls back to intensity computed from the generation mix where the
 * endpoint has no data.
 */
export async function fetchCo2History(
  country: string,
  start: string,
  end: string,
  get: Fetcher = fetchJson,
  pause: () => Promise<void> = async () => {},
): Promise<HourlySeries> {
  const points: { t: number; v: number }[] = [];
  const chunks = monthChunks(start, end);
  for (let i = 0; i < chunks.length; i += 3) {
    const from = chunks[i]![0];
    const to = chunks[Math.min(i + 2, chunks.length - 1)]![1];
    if (i > 0) await pause();
    const json = await get<Co2EqResponse>(`${BASE}/co2eq?country=${country}&start=${from}&end=${to}`);
    json.unix_seconds.forEach((s, k) => {
      const v = json.co2eq?.[k];
      if (typeof v === 'number') points.push({ t: s * 1000, v });
    });
  }
  if (points.length > 0) return toHourlySeries(points);
  return fetchMixCo2History(country, start, end, get, pause);
}

/** Production-based intensity computed from the generation mix (our own method). */
export async function fetchMixCo2History(
  country: string,
  start: string,
  end: string,
  get: Fetcher = fetchJson,
  pause: () => Promise<void> = async () => {},
): Promise<HourlySeries> {
  const points: { t: number; v: number }[] = [];
  for (const [i, [from, to]] of monthChunks(start, end).entries()) {
    if (i > 0) await pause();
    const json = await get<V2Response>(`${BASE}/v2/public_power?country=${country}&start=${from}&end=${to}`);
    for (const d of json.data) {
      const mix = toMixPoint(d.timestamp, d.values);
      if (mix) points.push({ t: Date.parse(d.timestamp), v: mix.co2 });
    }
  }
  return toHourlySeries(points);
}
