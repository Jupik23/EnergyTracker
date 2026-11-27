import type { FuelCategory } from './fuels';

/** Bump when the published JSON shape changes in a breaking way. */
export const SCHEMA_VERSION = 1;

export type CountryCode = 'pl' | 'de' | 'fr' | 'cz';

/** A single value at the start of an interval. `t` is an ISO-8601 timestamp with offset. */
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
}

export interface SourceRef {
  name: string;
  url: string;
  license: string;
}

export interface CountrySnapshot {
  schemaVersion: typeof SCHEMA_VERSION;
  country: CountryCode;
  timezone: string;
  intervalMinutes: number;
  generatedAt: string;
  /** Measured generation mix for today (local time), oldest first. */
  mix: MixPoint[];
  /** Day-ahead prices for today and, after ~13:00 CET, tomorrow. */
  prices: PriceSeries[];
  /** Forecast carbon intensity (g/kWh) for upcoming intervals, if available. */
  co2Forecast: Point[];
  sources: SourceRef[];
}

export interface IndexEntry {
  country: CountryCode;
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
  countries: IndexEntry[];
}
