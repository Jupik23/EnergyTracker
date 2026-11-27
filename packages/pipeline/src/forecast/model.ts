/**
 * Training, evaluation and prediction for the 7-day price / CO₂ forecast.
 *
 * One model per (country, target), pooled over horizons 1..7: each training
 * row is (target hour, horizon h) with the weather forecast issued h days
 * earlier and the anchor known at that time, so the model learns how much to
 * trust a 6-day-old wind forecast versus a 1-day-old one through the data.
 */
import type { ForecastConfig } from './config';
import { HORIZON_DAYS } from './config';
import { featureNames, features, issueTime, trailingMean } from './features';
import type { HourlySeries } from './history';
import type { HourWeather, WeatherByLead } from './openMeteo';
import { RidgeAccumulator, predict, type RidgeModel } from './ridge';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export type Target = 'price' | 'co2';

export interface HorizonStats {
  horizon: number;
  /** Hours evaluated. */
  n: number;
  mae: number;
  /** MAE of "same hour, last known week" — the bar a forecast has to clear. */
  baselineMae: number;
  /** Residual quantiles (actual − predicted), for the uncertainty band. */
  p10: number;
  p90: number;
  /**
   * How much worse (in the target's unit) the 3 cheapest/cleanest hours of a
   * day picked from the forecast were than the truly best 3 hours — and the
   * same for the baseline. The decision quality users actually get.
   */
  windowRegret?: number;
  baselineWindowRegret?: number;
}

export interface ForecastModel {
  version: 1;
  country: string;
  target: Target;
  unit: string;
  trainedAt: string;
  trainFrom: string;
  trainTo: string;
  ridge: RidgeModel;
  /** Out-of-sample statistics from the hold-out weeks before the final refit. */
  horizons: HorizonStats[];
}

interface Row {
  hourMs: number;
  horizon: number;
  x: number[];
  y: number;
  anchor: number;
}

/** Builds rows for every hour in [fromMs, toMs) that has a target value, weather and an anchor. */
export function buildRows(
  cfg: ForecastConfig,
  target: HourlySeries,
  weather: WeatherByLead,
  fromMs: number,
  toMs: number,
  horizons = range(1, HORIZON_DAYS),
): Row[] {
  const anchors = new Map<number, number | null>();
  const rows: Row[] = [];
  for (const [hourMs, y] of target) {
    if (hourMs < fromMs || hourMs >= toMs) continue;
    for (const h of horizons) {
      const w = weather.get(h)?.get(hourMs);
      if (!w) continue;
      const issue = issueTime(hourMs, h, cfg.timezone);
      let anchor = anchors.get(issue);
      if (anchor === undefined) {
        anchor = trailingMean(target, issue);
        anchors.set(issue, anchor);
      }
      if (anchor === null) continue;
      rows.push({ hourMs, horizon: h, y, anchor, x: featureVector(cfg, hourMs, w, anchor) });
    }
  }
  return rows;
}

export function featureVector(cfg: ForecastConfig, hourMs: number, weather: HourWeather, anchor: number) {
  return features({ hourMs, country: cfg.country, timezone: cfg.timezone, weather, anchor });
}

/**
 * Fits the ridge model. With `halfLifeDays`, older rows count less — the
 * market keeps changing (more solar and batteries, 15-minute products, new
 * interconnectors), so last spring says more about next week than 2024 does.
 */
export function fitRows(cfg: ForecastConfig, rows: Row[], lambda = 1e-3, halfLifeDays?: number): RidgeModel {
  const acc = new RidgeAccumulator(featureNames(cfg.wind.length));
  const latest = rows.reduce((m, r) => Math.max(m, r.hourMs), -Infinity);
  for (const r of rows) {
    const w = halfLifeDays ? 0.5 ** ((latest - r.hourMs) / (halfLifeDays * DAY)) : 1;
    acc.add(r.x, r.y, w);
  }
  return acc.fit(lambda);
}

/** Prediction in the target's units. (The anchor is already a feature; kept in the signature for call sites.) */
export function predictValue(model: RidgeModel, x: ArrayLike<number>, _anchor: number): number {
  return predict(model, x);
}

/** "Same hour of the week, last week that was fully known at issue time". */
export function baseline(target: HourlySeries, hourMs: number, issueMs: number): number | undefined {
  const weeksBack = Math.max(1, Math.ceil((hourMs - issueMs + 1) / WEEK));
  return target.get(hourMs - weeksBack * WEEK);
}

export function evaluate(
  cfg: ForecastConfig,
  model: RidgeModel,
  target: HourlySeries,
  rows: Row[],
  clampMin?: number,
): HorizonStats[] {
  const byH = new Map<number, { err: number[]; base: number[] }>();
  for (const r of rows) {
    let p = predictValue(model, r.x, r.anchor);
    if (clampMin !== undefined) p = Math.max(clampMin, p);
    const b = baseline(target, r.hourMs, issueTime(r.hourMs, r.horizon, cfg.timezone));
    if (b === undefined) continue;
    const s = byH.get(r.horizon) ?? { err: [], base: [] };
    s.err.push(r.y - p);
    s.base.push(Math.abs(r.y - b));
    byH.set(r.horizon, s);
  }
  return [...byH.entries()]
    .sort(([a], [b]) => a - b)
    .map(([horizon, s]) => ({
      horizon,
      n: s.err.length,
      mae: meanAbs(s.err),
      baselineMae: mean(s.base),
      p10: quantile(s.err, 0.1),
      p90: quantile(s.err, 0.9),
    }));
}

/**
 * Decision quality — what the user actually cares about: if you start a
 * `hours`-long appliance at the forecast's cheapest time of each day, how much
 * worse is it than the true best time? Returned as the mean regret per day for
 * the model and for the baseline, at each horizon.
 */
export function windowRegret(
  cfg: ForecastConfig,
  model: RidgeModel,
  target: HourlySeries,
  rows: Row[],
  hours = 3,
): { horizon: number; days: number; model: number; baseline: number }[] {
  // Group rows by (horizon, local day start).
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const dayStart = issueTime(r.hourMs, 0, cfg.timezone);
    const key = `${r.horizon}:${dayStart}`;
    const g = groups.get(key) ?? [];
    g.push(r);
    groups.set(key, g);
  }
  const acc = new Map<number, { days: number; model: number; baseline: number }>();
  for (const [key, g] of groups) {
    if (g.length < 23) continue;
    const horizon = Number(key.split(':')[0]);
    g.sort((a, b) => a.hourMs - b.hourMs);
    const actual = g.map((r) => r.y);
    const pred = g.map((r) => predictValue(model, r.x, r.anchor));
    const base = g.map((r) => baseline(target, r.hourMs, issueTime(r.hourMs, r.horizon, cfg.timezone)));
    if (base.some((b) => b === undefined)) continue;
    const best = argminWindow(actual, hours);
    const pick = argminWindow(pred, hours);
    const pickBase = argminWindow(base as number[], hours);
    const s = acc.get(horizon) ?? { days: 0, model: 0, baseline: 0 };
    s.days++;
    s.model += windowMean(actual, pick, hours) - windowMean(actual, best, hours);
    s.baseline += windowMean(actual, pickBase, hours) - windowMean(actual, best, hours);
    acc.set(horizon, s);
  }
  return [...acc.entries()]
    .sort(([a], [b]) => a - b)
    .map(([horizon, s]) => ({
      horizon,
      days: s.days,
      model: s.model / s.days,
      baseline: s.baseline / s.days,
    }));
}

/**
 * Trains the production model: fits on everything except the last
 * `holdoutWeeks`, measures out-of-sample error there (that is what the app
 * shows as the uncertainty band), then refits on all data.
 */
export function trainForecastModel(
  cfg: ForecastConfig,
  target: Target,
  series: HourlySeries,
  weather: WeatherByLead,
  opts: { now: Date; unit: string; holdoutWeeks?: number; lambda?: number; halfLifeDays?: number },
): ForecastModel {
  const hours = [...series.keys()].sort((a, b) => a - b);
  const fromMs = hours[0]!;
  const toMs = hours.at(-1)! + HOUR;
  const split = toMs - (opts.holdoutWeeks ?? 8) * WEEK;
  const clampMin = target === 'co2' ? 0 : undefined;

  const trainRows = buildRows(cfg, series, weather, fromMs, split);
  const testRows = buildRows(cfg, series, weather, split, toMs);
  const holdoutModel = fitRows(cfg, trainRows, opts.lambda, opts.halfLifeDays);
  const regret = windowRegret(cfg, holdoutModel, series, testRows, 3);
  const horizons = evaluate(cfg, holdoutModel, series, testRows, clampMin).map((h) => {
    const r = regret.find((x) => x.horizon === h.horizon);
    return r ? { ...h, windowRegret: r.model, baselineWindowRegret: r.baseline } : h;
  });

  const ridge = fitRows(cfg, [...trainRows, ...testRows], opts.lambda, opts.halfLifeDays);
  return {
    version: 1,
    country: cfg.country,
    target,
    unit: opts.unit,
    trainedAt: opts.now.toISOString(),
    trainFrom: new Date(fromMs).toISOString(),
    trainTo: new Date(toMs).toISOString(),
    ridge,
    horizons,
  };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const meanAbs = (xs: number[]) => mean(xs.map(Math.abs));

export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

function argminWindow(xs: number[], len: number): number {
  let best = 0;
  let bestSum = Infinity;
  for (let i = 0; i + len <= xs.length; i++) {
    let s = 0;
    for (let k = 0; k < len; k++) s += xs[i + k]!;
    if (s < bestSum) {
      bestSum = s;
      best = i;
    }
  }
  return best;
}

function windowMean(xs: number[], start: number, len: number): number {
  let s = 0;
  for (let k = 0; k < len; k++) s += xs[start + k]!;
  return s / len;
}

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

export { DAY, HOUR };
