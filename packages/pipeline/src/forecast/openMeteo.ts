/**
 * Open-Meteo weather API — free, no key, data CC BY 4.0.
 * The free tier is for non-commercial use (<10k calls/day); commercial use
 * needs their paid API plan. Docs: https://open-meteo.com/en/docs
 *
 * Two endpoints:
 *  - forecast: the next 8 days, for live predictions;
 *  - previous-runs: archived forecasts issued N days before each hour
 *    (`*_previous_dayN`), so training and back-testing see the same forecast
 *    error the live model will — not the weather that actually happened.
 */
import { fetchJson } from '../http';
import type { WeatherPoint } from './config';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const PREVIOUS_RUNS_URL = 'https://previous-runs-api.open-meteo.com/v1/forecast';

export const OPEN_METEO_SOURCE = {
  name: 'Open-Meteo',
  url: 'https://open-meteo.com',
  license: 'CC BY 4.0',
};

const VARS = ['wind_speed_100m', 'shortwave_radiation', 'temperature_2m'] as const;

/** Weather for one hour across all configured points (same order as the config). */
export interface HourWeather {
  /** m/s at 100 m, per wind point. */
  wind: number[];
  /** W/m², per area point. */
  solar: number[];
  /** °C, per area point. */
  temp: number[];
}

/** hour (UTC ms) -> weather; one map per forecast lead (0 = latest run). */
export type WeatherByLead = Map<number, Map<number, HourWeather>>;

interface OmResponse {
  hourly: Record<string, (number | null)[]> & { time: string[] };
}

type Fetcher = <T>(url: string) => Promise<T>;

function coords(points: WeatherPoint[]) {
  return `latitude=${points.map((p) => p.lat).join(',')}&longitude=${points.map((p) => p.lon).join(',')}`;
}

async function fetchPoints(
  base: string,
  points: WeatherPoint[],
  vars: string[],
  range: string,
  get: Fetcher,
): Promise<OmResponse[]> {
  const url = `${base}?${coords(points)}&hourly=${vars.join(',')}&${range}&wind_speed_unit=ms&timezone=UTC`;
  const res = await get<OmResponse | OmResponse[]>(url);
  return Array.isArray(res) ? res : [res];
}

/** Combines wind-point and area-point responses into per-hour weather for each lead. */
function assemble(
  windRes: OmResponse[],
  areaRes: OmResponse[],
  leads: number[],
  suffix: (lead: number) => string,
): WeatherByLead {
  const out: WeatherByLead = new Map();
  const times = windRes[0]?.hourly.time ?? [];
  for (const lead of leads) {
    const sfx = suffix(lead);
    const byHour = new Map<number, HourWeather>();
    times.forEach((t, i) => {
      const wind = windRes.map((r) => r.hourly[`wind_speed_100m${sfx}`]?.[i]);
      const solar = areaRes.map((r) => r.hourly[`shortwave_radiation${sfx}`]?.[i]);
      const temp = areaRes.map((r) => r.hourly[`temperature_2m${sfx}`]?.[i]);
      if ([...wind, ...solar, ...temp].some((v) => v == null)) return;
      byHour.set(Date.parse(`${t}:00Z`), {
        wind: wind as number[],
        solar: solar as number[],
        temp: temp as number[],
      });
    });
    out.set(lead, byHour);
  }
  return out;
}

/** Live forecast for the next `days` days (lead 0 only). */
export async function fetchWeatherForecast(
  wind: WeatherPoint[],
  area: WeatherPoint[],
  days: number,
  get: Fetcher = fetchJson,
): Promise<Map<number, HourWeather>> {
  const range = `forecast_days=${days}&past_days=1`;
  const windRes = await fetchPoints(FORECAST_URL, wind, ['wind_speed_100m'], range, get);
  const areaRes = await fetchPoints(
    FORECAST_URL,
    area,
    ['shortwave_radiation', 'temperature_2m'],
    range,
    get,
  );
  return assemble(windRes, areaRes, [0], () => '').get(0)!;
}

/**
 * Archived forecasts for [start, end] (YYYY-MM-DD) at the given leads in days.
 * Lead N means "the forecast for this hour as it was issued N days earlier".
 */
export async function fetchWeatherHistory(
  wind: WeatherPoint[],
  area: WeatherPoint[],
  start: string,
  end: string,
  leads: number[],
  get: Fetcher = fetchJson,
): Promise<WeatherByLead> {
  const suffix = (lead: number) => (lead === 0 ? '' : `_previous_day${lead}`);
  const vars = (names: readonly string[]) => names.flatMap((v) => leads.map((l) => `${v}${suffix(l)}`));
  const range = `start_date=${start}&end_date=${end}`;
  const windRes = await fetchPoints(PREVIOUS_RUNS_URL, wind, vars([VARS[0]]), range, get);
  const areaRes = await fetchPoints(PREVIOUS_RUNS_URL, area, vars([VARS[1], VARS[2]]), range, get);
  return assemble(windRes, areaRes, leads, suffix);
}
