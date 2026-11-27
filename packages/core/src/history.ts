/**
 * Historical mix, published to the `history` branch (separate from the
 * 15-minute `data` branch so that one stays small):
 *
 *   v1/history/index.json                 which months exist per country
 *   v1/history/<country>/<YYYY-MM>.json   hourly mix + CO₂ for one month
 *   v1/history/<country>/daily.json       one row per day, all months (for calendars and seasons)
 */
import { FUEL_CATEGORIES, type FuelCategory } from './fuels';
import { localDate } from './time';
import type { MixPoint, Point } from './types';

const HOUR = 3_600_000;

/** One month, hourly. Arrays are aligned: index i is the hour starting at t0 + i h. Gaps are null. */
export interface HistoryMonth {
  schemaVersion: 1;
  country: string;
  month: string; // YYYY-MM (local)
  timezone: string;
  t0: string; // ISO UTC, first hour of the month in local time
  hours: number;
  mw: Partial<Record<FuelCategory, (number | null)[]>>;
  co2: (number | null)[];
  renewableShare: (number | null)[];
  /** Where co2 comes from: Energy-Charts' measured values, or our calculation from the mix. */
  co2Source: 'energy-charts' | 'computed';
}

export interface HistoryDay {
  d: string; // YYYY-MM-DD (local)
  mw: Partial<Record<FuelCategory, number>>;
  co2: number;
  renewableShare: number;
}

export interface HistoryDaily {
  schemaVersion: 1;
  country: string;
  timezone: string;
  days: HistoryDay[];
}

export interface HistoryIndex {
  schemaVersion: 1;
  generatedAt: string;
  countries: Record<string, { months: string[] }>;
}

/** Averages any-resolution points into UTC hour buckets. */
function hourBuckets<T>(items: T[], t: (x: T) => string): Map<number, T[]> {
  const m = new Map<number, T[]>();
  for (const it of items) {
    const h = Math.floor(Date.parse(t(it)) / HOUR) * HOUR;
    m.set(h, [...(m.get(h) ?? []), it]);
  }
  return m;
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Builds an hourly month from mix points (15 min, 30 min or hourly) and,
 * when available, Energy-Charts' measured CO₂ points.
 */
export function buildHistoryMonth(
  country: string,
  month: string,
  timezone: string,
  mix: MixPoint[],
  co2Measured: Point[] = [],
): HistoryMonth {
  const inMonth = (t: string) => localDate(t, timezone).startsWith(month);
  const points = mix.filter((p) => inMonth(p.t));
  const co2Points = co2Measured.filter((p) => inMonth(p.t));

  const mixByHour = hourBuckets(points, (p) => p.t);
  const co2ByHour = hourBuckets(co2Points, (p) => p.t);
  const hoursPresent = [...new Set([...mixByHour.keys(), ...co2ByHour.keys()])].sort((a, b) => a - b);

  // First local hour of the month (handles CET/CEST): earliest hour whose local date is the 1st.
  const first = monthStartUtc(month, timezone);
  const last = hoursPresent.length ? hoursPresent.at(-1)! : first - HOUR;
  const hours = Math.max(0, Math.round((last - first) / HOUR) + 1);

  const useEc = co2Points.length >= points.length * 0.5 && co2Points.length > 0;
  const mw: HistoryMonth['mw'] = {};
  const co2: (number | null)[] = [];
  const renewableShare: (number | null)[] = [];

  for (let i = 0; i < hours; i++) {
    const h = first + i * HOUR;
    const ps = mixByHour.get(h);
    for (const c of FUEL_CATEGORIES) {
      if (!points.some((p) => p.mw[c] !== undefined)) continue;
      (mw[c] ??= []).push(ps ? Math.round(avg(ps.map((p) => p.mw[c] ?? 0))) : null);
    }
    const ec = co2ByHour.get(h);
    co2.push(
      useEc && ec ? Math.round(avg(ec.map((p) => p.v))) : ps ? Math.round(avg(ps.map((p) => p.co2))) : null,
    );
    renewableShare.push(ps ? round1(avg(ps.map((p) => p.renewableShare))) : null);
  }

  return {
    schemaVersion: 1,
    country,
    month,
    timezone,
    t0: new Date(first).toISOString(),
    hours,
    mw,
    co2,
    renewableShare,
    co2Source: useEc ? 'energy-charts' : 'computed',
  };
}

/** UTC timestamp of local midnight on the 1st of `month`. */
export function monthStartUtc(month: string, timezone: string): number {
  const guess = Date.parse(`${month}-01T00:00:00Z`);
  // Local midnight is between UTC-14h and UTC+14h of the UTC midnight; find the first hour whose local date is the 1st.
  for (let h = guess - 14 * HOUR; h <= guess + 14 * HOUR; h += HOUR) {
    if (localDate(new Date(h), timezone) === `${month}-01`) return h;
  }
  return guess;
}

/** Hour timestamps (ISO) of a month file. */
export function monthHours(m: HistoryMonth): string[] {
  const t0 = Date.parse(m.t0);
  return Array.from({ length: m.hours }, (_, i) => new Date(t0 + i * HOUR).toISOString());
}

/** Daily averages from a month; days with fewer than 12 hours of data are skipped. */
export function dailyFromMonth(m: HistoryMonth): HistoryDay[] {
  const hours = monthHours(m);
  const byDay = new Map<string, number[]>();
  hours.forEach((t, i) => {
    if (m.co2[i] == null) return;
    const d = localDate(t, m.timezone);
    byDay.set(d, [...(byDay.get(d) ?? []), i]);
  });
  const out: HistoryDay[] = [];
  for (const [d, idx] of byDay) {
    if (idx.length < 12) continue;
    const mw: HistoryDay['mw'] = {};
    for (const [c, arr] of Object.entries(m.mw) as [FuelCategory, (number | null)[]][]) {
      const vals = idx.map((i) => arr[i]).filter((v): v is number => v != null);
      if (vals.length) mw[c] = Math.round(avg(vals));
    }
    const ren = idx.map((i) => m.renewableShare[i]).filter((v): v is number => v != null);
    out.push({
      d,
      mw,
      co2: Math.round(avg(idx.map((i) => m.co2[i]!))),
      renewableShare: ren.length ? round1(avg(ren)) : 0,
    });
  }
  return out.sort((a, b) => a.d.localeCompare(b.d));
}

/** Months between two YYYY-MM values, inclusive. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/** Last calendar day of a month, YYYY-MM-DD. */
export function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
