/**
 * Contract of `v1/<zone>/forecast.json` — the 7-day price and CO₂ outlook
 * ("pogoda dla prądu"). Produced by packages/pipeline/src/forecast.
 */

export interface ForecastPoint {
  /** Hour start, ISO UTC. */
  t: string;
  /** Central forecast. */
  v: number;
  /** 10th and 90th percentile of out-of-sample error around `v`. */
  lo: number;
  hi: number;
}

export type DayTone = 'cheap' | 'normal' | 'expensive';

export interface ForecastDay {
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** Days after today (1 = tomorrow). */
  horizon: number;
  /** True when the day's prices are already fixed by the day-ahead auction. */
  pricesKnown: boolean;
  /** Wholesale price in `ForecastFile.currency` per MWh. */
  priceAvg: number | null;
  priceMin: number | null;
  priceMax: number | null;
  co2Avg: number | null;
  /** Cheapest / cleanest 3-hour block of the day. */
  cheapest3h: { start: string; end: string; avg: number } | null;
  cleanest3h: { start: string; end: string; avg: number } | null;
  /** Price level among the 7 days. */
  tone: DayTone;
  /** Weather drivers: mean wind output 0..1 (turbine power curve), midday sun (W/m²), mean temperature (°C). */
  wind: number;
  sun: number;
  temp: number;
  /** One-line explanation in Polish, e.g. "Silny wiatr — tani i czysty prąd przez większość dnia". */
  summary: string;
}

export interface ForecastAccuracy {
  horizon: number;
  /** Mean absolute error of the model in the hold-out weeks, in the series' unit. */
  mae: number;
  /** Same for "same hour last week" — the forecast is useful only if it beats this. */
  baselineMae: number;
  /**
   * Average extra cost (or CO₂) of running a 3-hour appliance in the day's best
   * window according to the forecast instead of the truly best window; and the
   * same when choosing by "same hour last week".
   */
  windowRegret?: number;
  baselineWindowRegret?: number;
}

export interface ForecastSeries {
  unit: string;
  points: ForecastPoint[];
  accuracy: ForecastAccuracy[];
}

export interface ForecastFile {
  schemaVersion: 1;
  zone: string;
  timezone: string;
  generatedAt: string;
  modelTrainedAt: string;
  /** Currency of `price` and day prices (per MWh, like the snapshot). */
  currency: 'PLN' | 'EUR';
  price: ForecastSeries | null;
  co2: ForecastSeries | null;
  days: ForecastDay[];
  sources: { name: string; url: string; license: string }[];
}

/**
 * `v1/<zone>/prices-year.json` — the last 365 days of hourly day-ahead prices,
 * refreshed weekly. Feeds the tariff comparison (what a dynamic tariff would
 * have cost over the past year).
 */
export interface PricesYear {
  schemaVersion: 1;
  zone: string;
  currency: 'PLN' | 'EUR';
  unit: string;
  /** First hour (ISO UTC); values follow hourly, null where unknown. */
  start: string;
  values: (number | null)[];
  sources: { name: string; url: string; license: string }[];
}
