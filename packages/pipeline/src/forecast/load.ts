import type { ForecastConfig } from './config';
import { HORIZON_DAYS } from './config';
import type { Fetcher } from './fetchers';
import { fetchWeatherHistory, type WeatherByLead } from './openMeteo';

/** Archived forecasts at leads 1..7 for [from, to], fetched in half-year chunks. */
export async function loadWeatherHistory(
  cfg: ForecastConfig,
  from: string,
  to: string,
  get: Fetcher,
): Promise<WeatherByLead> {
  const leads = Array.from({ length: HORIZON_DAYS }, (_, i) => i + 1);
  const merged: WeatherByLead = new Map(leads.map((l) => [l, new Map()]));
  let cur = from;
  while (cur <= to) {
    const d = new Date(`${cur}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 6);
    d.setUTCDate(d.getUTCDate() - 1);
    const chunkEnd = d.toISOString().slice(0, 10);
    const end = chunkEnd < to ? chunkEnd : to;
    const part = await fetchWeatherHistory(cfg.wind, cfg.area, cur, end, leads, get);
    for (const [lead, hours] of part) for (const [h, w] of hours) merged.get(lead)!.set(h, w);
    d.setUTCDate(d.getUTCDate() + 1);
    cur = d.toISOString().slice(0, 10);
  }
  return merged;
}

export function daysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}
