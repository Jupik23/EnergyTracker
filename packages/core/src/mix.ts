import {
  FUEL_CATEGORIES,
  RENEWABLE_CATEGORIES,
  fuelDef,
  isGenerationSeries,
  type FuelCategory,
} from './fuels';
import type { MixPoint } from './types';

/**
 * Turns one interval of raw generation (MW per upstream series id) into a
 * display mix with production-based carbon intensity and renewable share.
 * Returns null when there is no positive generation (e.g. data not yet published).
 */
export function toMixPoint(t: string, raw: Record<string, number | null | undefined>): MixPoint | null {
  const mw: Partial<Record<FuelCategory, number>> = {};
  let total = 0;
  let emissions = 0; // MW * g/kWh — units cancel when divided by total MW
  let renewable = 0;

  for (const [id, value] of Object.entries(raw)) {
    if (value == null || !Number.isFinite(value) || value <= 0) continue;
    if (!isGenerationSeries(id)) continue;
    const def = fuelDef(id);
    mw[def.category] = (mw[def.category] ?? 0) + value;
    total += value;
    emissions += value * def.gCo2PerKwh;
    if (RENEWABLE_CATEGORIES.has(def.category)) renewable += value;
  }

  if (total <= 0) return null;

  for (const k of FUEL_CATEGORIES) {
    if (mw[k] !== undefined) mw[k] = round(mw[k]!, 1);
  }

  return {
    t,
    mw,
    co2: Math.round(emissions / total),
    renewableShare: round((renewable / total) * 100, 1),
  };
}

export function totalMw(p: MixPoint): number {
  return Object.values(p.mw).reduce((a, b) => a + (b ?? 0), 0);
}

/** Share of each category in a point, 0..100, in display order. */
export function mixShares(p: MixPoint): { category: FuelCategory; mw: number; share: number }[] {
  const total = totalMw(p);
  return FUEL_CATEGORIES.filter((c) => (p.mw[c] ?? 0) > 0).map((c) => ({
    category: c,
    mw: p.mw[c]!,
    share: total > 0 ? (p.mw[c]! / total) * 100 : 0,
  }));
}

function round(x: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
