/**
 * Energy-Charts API by Fraunhofer ISE — free, no API key.
 * Docs: https://api.energy-charts.info/
 * Data licence: CC BY 4.0 (attribution required; underlying data from ENTSO-E,
 * national TSOs and exchanges).
 */
import { toMixPoint, type MixPoint, type Point } from '@energy/core';
import { fetchJson } from '../http';

const BASE = 'https://api.energy-charts.info';

interface V2Response {
  schema_version: string;
  unit: string;
  interval_minutes: number;
  data: { timestamp: string; values: Record<string, number | null> }[];
}

interface Co2Response {
  unix_seconds: number[];
  co2eq?: (number | null)[];
  co2eq_forecast?: (number | null)[];
}

export const ENERGY_CHARTS_SOURCE = {
  name: 'Energy-Charts (Fraunhofer ISE)',
  url: 'https://www.energy-charts.info',
  license: 'CC BY 4.0',
};

const iso = (s: string) => new Date(s).toISOString();

export function parsePublicPower(json: V2Response): MixPoint[] {
  return json.data
    .map((d) => toMixPoint(iso(d.timestamp), d.values))
    .filter((p): p is MixPoint => p !== null);
}

export function parsePrice(json: V2Response): Point[] {
  return json.data
    .filter((d) => typeof d.values.day_ahead_price === 'number')
    .map((d) => ({ t: iso(d.timestamp), v: d.values.day_ahead_price as number }));
}

/** Splits co2eq into measured values and the forecast for intervals not yet measured. */
export function parseCo2(json: Co2Response): { measured: Point[]; forecast: Point[] } {
  const measured: Point[] = [];
  const forecast: Point[] = [];
  json.unix_seconds.forEach((s, i) => {
    const t = new Date(s * 1000).toISOString();
    const m = json.co2eq?.[i];
    const f = json.co2eq_forecast?.[i];
    if (typeof m === 'number') measured.push({ t, v: Math.round(m) });
    else if (typeof f === 'number') forecast.push({ t, v: Math.round(f) });
  });
  return { measured, forecast };
}

export async function fetchPublicPower(
  country: string,
  start: string,
  end: string,
): Promise<{ mix: MixPoint[]; intervalMinutes: number }> {
  const url = `${BASE}/v2/public_power?country=${country}&start=${start}&end=${end}`;
  const json = await fetchJson<V2Response>(url);
  // Resolution differs by country: 15 min (PL, DE), 30 min (IE) or hourly (BE, GR).
  return { mix: parsePublicPower(json), intervalMinutes: json.interval_minutes || 15 };
}

export async function fetchPrice(biddingZone: string, start: string, end: string) {
  const url = `${BASE}/v2/price?bzn=${biddingZone}&start=${start}&end=${end}`;
  return parsePrice(await fetchJson<V2Response>(url));
}

/**
 * Measured + forecast CO₂ intensity. This endpoint is not in the published
 * OpenAPI spec, so it is treated as best-effort: callers must tolerate failure.
 */
export async function fetchCo2(country: string, start?: string, end?: string) {
  const range = start && end ? `&start=${start}&end=${end}` : '';
  return parseCo2(await fetchJson<Co2Response>(`${BASE}/co2eq?country=${country}${range}`, { retries: 1 }));
}
