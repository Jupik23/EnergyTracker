/**
 * Turns trained models + the live weather forecast into `forecast.json`.
 * Pure: all inputs are passed in, so it is unit-tested without the network.
 */
import {
  bestWindows,
  type DayTone,
  type ForecastDay,
  type ForecastFile,
  type ForecastPoint,
  type ForecastSeries,
  type Point,
} from '@energy/core';
import { localParts } from './calendar';
import type { ForecastConfig } from './config';
import { HORIZON_DAYS } from './config';
import { issueTime, powerCurve, trailingMean } from './features';
import type { HourlySeries } from './history';
import { featureVector, predictValue, type ForecastModel } from './model';
import type { HourWeather } from './openMeteo';

const HOUR = 3_600_000;

export interface PredictInput {
  cfg: ForecastConfig;
  zone: string;
  price?: ForecastModel;
  co2?: ForecastModel;
  /** Live weather forecast, hour (UTC ms) -> weather. */
  weather: Map<number, HourWeather>;
  /** Recent hourly history (≥ 7 days before today), in the models' units (EUR/MWh, g/kWh). */
  recentPrice: HourlySeries;
  recentCo2: HourlySeries;
  /** Day-ahead prices already published (in output currency per MWh), hour -> value. */
  knownPrices?: HourlySeries;
  /** Multiplier from model currency (EUR) to output currency. */
  fx: number;
  currency: 'PLN' | 'EUR';
  now: Date;
  sources: ForecastFile['sources'];
}

/** Hours of local days 1..HORIZON_DAYS after today, grouped by date (DST-safe). */
export function horizonDays(
  nowMs: number,
  timezone: string,
): { date: string; horizon: number; hours: number[] }[] {
  const todayStart = issueTime(Math.floor(nowMs / HOUR) * HOUR, 0, timezone);
  const today = localParts(todayStart, timezone).date;
  const days: { date: string; horizon: number; hours: number[] }[] = [];
  for (let t = todayStart; t < todayStart + (HORIZON_DAYS + 1) * 24 * HOUR + 2 * HOUR; t += HOUR) {
    const { date } = localParts(t, timezone);
    if (date === today) continue;
    let d = days.at(-1);
    if (!d || d.date !== date) {
      if (days.length === HORIZON_DAYS) break;
      d = { date, horizon: days.length + 1, hours: [] };
      days.push(d);
    }
    d.hours.push(t);
  }
  return days;
}

function band(model: ForecastModel, horizon: number): { p10: number; p90: number } {
  const h = model.horizons.find((x) => x.horizon === horizon) ?? model.horizons.at(-1);
  return { p10: h?.p10 ?? 0, p90: h?.p90 ?? 0 };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

function best3h(points: ForecastPoint[]): ForecastDay['cheapest3h'] {
  const [w] = bestWindows(
    points.map((p): Point => ({ t: p.t, v: p.v })),
    { durationMinutes: 180, limit: 1 },
  );
  return w ? { start: w.start, end: w.end, avg: round(w.avg) } : null;
}

/** One-line, plain-language reason for the day's prices and emissions. */
export function describeDay(wind: number, sun: number, temp: number, tone: DayTone): string {
  const parts: string[] = [];
  if (wind >= 0.45) parts.push('Silny wiatr');
  else if (wind >= 0.25) parts.push('Umiarkowany wiatr');
  else if (wind < 0.12) parts.push('Prawie bezwietrznie');
  if (sun >= 450) parts.push('dużo słońca w południe');
  else if (sun < 120 && wind < 0.25) parts.push('pochmurno');
  if (temp <= -3) parts.push('mróz');
  const head = parts.length ? parts.join(', ') : 'Przeciętna pogoda';
  const tail =
    tone === 'cheap'
      ? wind >= 0.25
        ? 'tani i czystszy prąd przez większość dnia'
        : 'najtaniej w środku dnia'
      : tone === 'expensive'
        ? 'drogo, zwłaszcza wieczorem'
        : 'ceny typowe';
  return `${head.charAt(0).toUpperCase()}${head.slice(1)} — ${tail}`;
}

export function makeForecast(input: PredictInput): ForecastFile {
  const { cfg, weather, now } = input;
  const todayStart = issueTime(Math.floor(now.getTime() / HOUR) * HOUR, 0, cfg.timezone);
  const priceAnchor = trailingMean(input.recentPrice, todayStart);
  const co2Anchor = trailingMean(input.recentCo2, todayStart);
  const days = horizonDays(now.getTime(), cfg.timezone);

  const pricePoints: ForecastPoint[] = [];
  const co2Points: ForecastPoint[] = [];
  const dayOut: Omit<ForecastDay, 'tone' | 'summary'>[] = [];

  for (const day of days) {
    const dp: ForecastPoint[] = [];
    const dc: ForecastPoint[] = [];
    const winds: number[] = [];
    const suns: number[] = [];
    const temps: number[] = [];
    const known = day.hours.every((h) => input.knownPrices?.has(h));

    for (const h of day.hours) {
      const w = weather.get(h);
      if (!w) continue;
      winds.push(mean(w.wind.map(powerCurve)));
      suns.push(mean(w.solar));
      temps.push(mean(w.temp));
      const t = new Date(h).toISOString();
      if (known) {
        const v = input.knownPrices!.get(h)!;
        dp.push({ t, v: round(v), lo: round(v), hi: round(v) });
      } else if (input.price && priceAnchor !== null) {
        const v = predictValue(input.price.ridge, featureVector(cfg, h, w, priceAnchor), priceAnchor);
        const b = band(input.price, day.horizon);
        dp.push({
          t,
          v: round(v * input.fx),
          lo: round((v + b.p10) * input.fx),
          hi: round((v + b.p90) * input.fx),
        });
      }
      if (input.co2 && co2Anchor !== null) {
        const v = Math.max(0, predictValue(input.co2.ridge, featureVector(cfg, h, w, co2Anchor), co2Anchor));
        const b = band(input.co2, day.horizon);
        dc.push({ t, v: Math.round(v), lo: Math.max(0, Math.round(v + b.p10)), hi: Math.round(v + b.p90) });
      }
    }
    pricePoints.push(...dp);
    co2Points.push(...dc);
    const pv = dp.map((p) => p.v);
    dayOut.push({
      date: day.date,
      horizon: day.horizon,
      pricesKnown: known,
      priceAvg: pv.length ? round(mean(pv)) : null,
      priceMin: pv.length ? Math.min(...pv) : null,
      priceMax: pv.length ? Math.max(...pv) : null,
      co2Avg: dc.length ? Math.round(mean(dc.map((p) => p.v))) : null,
      cheapest3h: best3h(dp),
      cleanest3h: best3h(dc),
      wind: round(mean(winds), 2),
      sun: Math.round(suns.length ? Math.max(...suns) : 0),
      temp: round(mean(temps)),
    });
  }

  const avgs = dayOut
    .map((d) => d.priceAvg)
    .filter((x): x is number => x !== null)
    .sort((a, b) => a - b);
  const third = (q: number) => avgs[Math.min(avgs.length - 1, Math.floor(q * avgs.length))]!;
  const toneOf = (avg: number | null): DayTone =>
    avg === null || avgs.length < 3
      ? 'normal'
      : avg <= third(1 / 3) - 1e-9
        ? 'cheap'
        : avg >= third(2 / 3)
          ? 'expensive'
          : 'normal';

  const series = (
    model: ForecastModel | undefined,
    points: ForecastPoint[],
    unit: string,
  ): ForecastSeries | null =>
    model && points.length
      ? {
          unit,
          points,
          accuracy: model.horizons.map((h) => {
            const k = unit.endsWith('/MWh') ? input.fx : 1;
            return {
              horizon: h.horizon,
              mae: round(h.mae * k),
              baselineMae: round(h.baselineMae * k),
              ...(h.windowRegret !== undefined && h.baselineWindowRegret !== undefined
                ? {
                    windowRegret: round(h.windowRegret * k),
                    baselineWindowRegret: round(h.baselineWindowRegret * k),
                  }
                : {}),
            };
          }),
        }
      : null;

  return {
    schemaVersion: 1,
    zone: input.zone,
    timezone: cfg.timezone,
    generatedAt: now.toISOString(),
    modelTrainedAt: input.price?.trainedAt ?? input.co2?.trainedAt ?? '',
    currency: input.currency,
    price: series(input.price, pricePoints, `${input.currency}/MWh`),
    co2: series(input.co2, co2Points, 'g/kWh'),
    days: dayOut.map((d) => {
      const tone = toneOf(d.priceAvg);
      return { ...d, tone, summary: describeDay(d.wind, d.sun, d.temp, tone) };
    }),
    sources: input.sources,
  };
}
