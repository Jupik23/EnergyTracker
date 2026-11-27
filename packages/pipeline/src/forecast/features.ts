/**
 * Feature engineering. The model is linear, so the physics goes in here:
 * wind speed becomes a turbine power-curve proxy, solar radiation and
 * temperature (heating/cooling demand) are averaged over the country, and the
 * calendar captures the daily and weekly demand shape.
 *
 * `anchor` is the level of the target over the 7 days before the forecast was
 * issued. It carries what weather cannot: fuel and CO₂ allowance prices,
 * plant outages, the season's import pattern. Interactions with wind and solar
 * let the model learn that a windy hour knocks more off a high price than off
 * a low one.
 */
import type { HourWeather } from './openMeteo';
import { localParts, isHoliday } from './calendar';
import type { HourlySeries } from './history';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ANCHOR_DAYS = 7;

/** Normalised output of a typical turbine at hub height: 0 below cut-in, 1 at rated speed. */
export function powerCurve(ms: number): number {
  if (ms < 3 || ms > 25) return 0;
  if (ms >= 12) return 1;
  return ((ms - 3) / 9) ** 3;
}

/** Parts of the day with distinct price behaviour: night trough, morning ramp, solar midday, evening peak. */
const HOUR_GROUPS = ['night', 'morning', 'midday', 'evening'] as const;

function hourGroup(hour: number): (typeof HOUR_GROUPS)[number] {
  if (hour >= 6 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 16) return 'midday';
  if (hour >= 16 && hour < 22) return 'evening';
  return 'night';
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function featureNames(windPoints: number): string[] {
  return [
    ...Array.from({ length: 23 }, (_, i) => `hour_${i + 1}`),
    'saturday',
    'sunday_or_holiday',
    ...Array.from({ length: windPoints }, (_, i) => `wind_${i}`),
    'wind_mean_sq',
    ...HOUR_GROUPS.map((g) => `wind_x_${g}`),
    'solar',
    'solar_sq',
    'solar_x_offday',
    'heating',
    'cooling',
    'season_sin',
    'season_cos',
    'anchor',
    'anchor_x_wind',
    'anchor_x_solar',
    ...HOUR_GROUPS.slice(1).map((g) => `anchor_x_${g}`),
  ];
}

export interface FeatureInput {
  hourMs: number;
  country: string;
  timezone: string;
  weather: HourWeather;
  anchor: number;
}

export function features({ hourMs, country, timezone, weather, anchor }: FeatureInput): number[] {
  const { date, hour, weekday } = localParts(hourMs, timezone);
  const offday = weekday === 0 || isHoliday(country, date);
  const winds = weather.wind.map(powerCurve);
  const windMean = mean(winds);
  const solar = mean(weather.solar) / 1000; // kW/m²
  const temp = mean(weather.temp);
  const doy = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${date.slice(0, 4)}-01-01T00:00:00Z`)) / DAY;
  const angle = (2 * Math.PI * doy) / 365.25;
  const anchorScaled = anchor / 100;
  const group = hourGroup(hour);

  return [
    ...Array.from({ length: 23 }, (_, i) => (hour === i + 1 ? 1 : 0)),
    weekday === 6 && !offday ? 1 : 0,
    offday ? 1 : 0,
    ...winds,
    windMean ** 2,
    ...HOUR_GROUPS.map((g) => (g === group ? windMean : 0)),
    solar,
    solar ** 2,
    offday ? solar : 0,
    Math.max(0, 15 - temp) / 10,
    Math.max(0, temp - 22) / 10,
    Math.sin(angle),
    Math.cos(angle),
    anchor,
    anchorScaled * windMean,
    anchorScaled * solar,
    ...HOUR_GROUPS.slice(1).map((g) => (g === group ? anchor : 0)),
  ];
}

/** Local midnight of the target's day, minus `horizon` days: when a forecast for it is issued. */
export function issueTime(hourMs: number, horizon: number, timezone: string): number {
  const { hour } = localParts(hourMs, timezone);
  return hourMs - hour * HOUR - horizon * DAY;
}

/** Mean of the series over the 7 days before `issueMs`; null when under half of that is known. */
export function trailingMean(series: HourlySeries, issueMs: number): number | null {
  let s = 0;
  let n = 0;
  for (let t = issueMs - ANCHOR_DAYS * DAY; t < issueMs; t += HOUR) {
    const v = series.get(t);
    if (v !== undefined) {
      s += v;
      n++;
    }
  }
  return n >= (ANCHOR_DAYS * 24) / 2 ? s / n : null;
}
