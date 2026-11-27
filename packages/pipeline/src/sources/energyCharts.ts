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

/** Only the forecast part, from the first interval without a measured value onward. */
export function parseCo2Forecast(json: Co2Response): Point[] {
  const out: Point[] = [];
  const forecast = json.co2eq_forecast ?? [];
  json.unix_seconds.forEach((s, i) => {
    const measured = json.co2eq?.[i];
    const f = forecast[i];
    if (measured == null && typeof f === 'number') {
      out.push({ t: new Date(s * 1000).toISOString(), v: Math.round(f) });
    }
  });
  return out;
}

export async function fetchPublicPower(country: string, start: string, end: string) {
  const url = `${BASE}/v2/public_power?country=${country}&start=${start}&end=${end}`;
  return parsePublicPower(await fetchJson<V2Response>(url));
}

export async function fetchPrice(biddingZone: string, start: string, end: string) {
  const url = `${BASE}/v2/price?bzn=${biddingZone}&start=${start}&end=${end}`;
  return parsePrice(await fetchJson<V2Response>(url));
}

/**
 * CO₂ forecast. This endpoint is not in the published OpenAPI spec, so it is
 * treated as best-effort: callers must tolerate failure.
 */
export async function fetchCo2Forecast(country: string) {
  return parseCo2Forecast(await fetchJson<Co2Response>(`${BASE}/co2eq?country=${country}`, { retries: 1 }));
}
