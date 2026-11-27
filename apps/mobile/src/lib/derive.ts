import {
  FUEL_CATEGORIES,
  type CountrySnapshot,
  type FuelCategory,
  type MixPoint,
  type Point,
} from '@energy/core';

/** The price point covering `at` (interval start <= at < next start). */
export function pointAt(points: Point[], at: Date): Point | null {
  const ms = at.getTime();
  let hit: Point | null = null;
  for (const p of points) {
    if (Date.parse(p.t) <= ms) hit = p;
    else break;
  }
  if (!hit) return null;
  // Stale if the last point is more than an hour behind.
  return ms - Date.parse(hit.t) < 3_600_000 ? hit : null;
}

/** Hourly average MW per category, for the stacked "mix over the day" chart. */
export function hourlyMix(mix: MixPoint[]): { t: string; mw: Partial<Record<FuelCategory, number>> }[] {
  const buckets = new Map<number, { n: number; mw: Partial<Record<FuelCategory, number>> }>();
  for (const p of mix) {
    const h = Math.floor(Date.parse(p.t) / 3_600_000) * 3_600_000;
    const b = buckets.get(h) ?? { n: 0, mw: {} };
    b.n += 1;
    for (const c of FUEL_CATEGORIES) b.mw[c] = (b.mw[c] ?? 0) + (p.mw[c] ?? 0);
    buckets.set(h, b);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([h, b]) => ({
      t: new Date(h).toISOString(),
      mw: Object.fromEntries(FUEL_CATEGORIES.map((c) => [c, (b.mw[c] ?? 0) / b.n])),
    }));
}

/** Measured intensity followed by forecast, without overlap. */
export function co2Series(s: CountrySnapshot): { measured: Point[]; forecast: Point[] } {
  const measured = s.mix.map((p) => ({ t: p.t, v: p.co2 }));
  const lastMs = measured.length ? Date.parse(measured.at(-1)!.t) : -Infinity;
  return { measured, forecast: s.co2Forecast.filter((p) => Date.parse(p.t) > lastMs) };
}
