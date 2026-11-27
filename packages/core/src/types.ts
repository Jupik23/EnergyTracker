import type { FuelCategory } from './fuels';

/**
 * Bump only for breaking changes, together with a new path prefix (v2/…):
 * app versions already in the stores keep reading v1/. Additive optional
 * fields do not need a bump.
 */
export const SCHEMA_VERSION = 1;

/** Zone id, see zones.ts ("pl", "se3", "it-north"…). */
export type ZoneId = string;

/** A single value at the start of an interval. `t` is an ISO-8601 UTC timestamp. */
export interface Point {
  t: string;
  v: number;
}

export interface MixPoint {
  t: string;
  /** Average generation in MW per display category. */
  mw: Partial<Record<FuelCategory, number>>;
  /** Production-based carbon intensity, g CO₂-eq / kWh. */
  co2: number;
  /** Share of renewables in generation, 0..100. */
  renewableShare: number;
}

export interface PriceSeries {
  /** e.g. "PLN/MWh" or "EUR/MWh". */
  unit: string;
  currency: 'PLN' | 'EUR';
  source: string;
  points: Point[];
  /** When the pipeline last fetched this series (prices change once a day, so they are cached). */
  fetchedAt?: string;
}

export interface SourceRef {
  name: string;
  url: string;
  license: string;
}

export interface ZoneSnapshot {
  schemaVersion: typeof SCHEMA_VERSION;
  /** Country code (lower case). For single-zone countries equal to `zone`. */
  country: string;
  zone?: ZoneId;
  biddingZone?: string;
  timezone: string;
  intervalMinutes: number;
  generatedAt: string;
  /** Measured generation mix of the country for today (local time), oldest first. */
  mix: MixPoint[];
  /** Day-ahead prices for today and, after ~13:00 CET, tomorrow. Preferred series first. */
  prices: PriceSeries[];
  /**
   * Measured carbon intensity from Energy-Charts (g/kWh). Preferred over the
   * intensity we compute from the mix, because it shares one methodology with
   * `co2Forecast` — so the chart has no jump at "now". Absent in older files.
   */
  co2Measured?: Point[];
  /** Forecast carbon intensity (g/kWh) for upcoming intervals, if available. */
  co2Forecast: Point[];
  co2ForecastFetchedAt?: string;
  sources: SourceRef[];
}

export interface IndexEntry {
  zone: ZoneId;
  country: string;
  updatedAt: string;
  ok: boolean;
  error?: string;
  latest?: {
    t: string;
    co2: number;
    renewableShare: number;
  };
}

export interface DataIndex {
  schemaVersion: typeof SCHEMA_VERSION;
  generatedAt: string;
  zones: IndexEntry[];
}

export interface HistoryDay {
  schemaVersion: typeof SCHEMA_VERSION;
  zone: ZoneId;
  country: string;
  date: string;
  mix: MixPoint[];
  prices?: PriceSeries[];
}
