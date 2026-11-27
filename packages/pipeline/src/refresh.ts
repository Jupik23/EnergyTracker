/**
 * Decides what to re-fetch on a run. The job runs every 15 minutes for ~40
 * zones, but day-ahead prices only change once a day and the CO₂ forecast is
 * hourly, so most runs only need the generation mix. This keeps us well under
 * Energy-Charts' rate limit.
 */
import { addDays, localDate, localHour, type Point, type PriceSeries } from '@energy/core';

const MINUTE = 60_000;

/** SDAC day-ahead results are out around 12:45 CET (RCE around 14:00), so start polling at 13:00 local. */
const TOMORROW_PUBLISHED_FROM_HOUR = 13;
/** Published prices never change; this is only a safety net. */
const PRICE_MAX_AGE_MS = 12 * 60 * MINUTE;
export const CO2_MAX_AGE_MS = 55 * MINUTE;
const CO2_HARD_MAX_AGE_MS = 75 * MINUTE;

export function needsPriceRefresh(prev: PriceSeries | undefined, now: Date, timeZone: string): boolean {
  if (!prev?.fetchedAt || prev.points.length === 0) return true;
  const age = now.getTime() - Date.parse(prev.fetchedAt);
  const today = localDate(now, timeZone);
  const days = new Set(prev.points.map((p) => localDate(p.t, timeZone)));
  if (!days.has(today)) return true;
  if (!days.has(addDays(today, 1)) && localHour(now, timeZone) >= TOMORROW_PUBLISHED_FROM_HOUR) return true;
  return age >= PRICE_MAX_AGE_MS;
}

/**
 * Hourly, but spread over the four quarter-hour runs by country so ~27
 * forecasts are not all due in the same run (which would trip the rate limit).
 */
export function needsCo2Refresh(fetchedAt: string | undefined, now: Date, country = ''): boolean {
  if (!fetchedAt) return true;
  const age = now.getTime() - Date.parse(fetchedAt);
  if (age >= CO2_HARD_MAX_AGE_MS) return true;
  const myQuarter = [...country].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 4;
  return age >= CO2_MAX_AGE_MS - 15 * MINUTE && Math.floor(now.getUTCMinutes() / 15) === myQuarter;
}

/** Drops points before the start of today (local), e.g. yesterday's prices kept in the cache. */
export function fromToday(points: Point[], now: Date, timeZone: string): Point[] {
  const today = localDate(now, timeZone);
  return points.filter((p) => localDate(p.t, timeZone) >= today);
}
