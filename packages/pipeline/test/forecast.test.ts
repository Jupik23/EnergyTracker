import { describe, expect, it } from 'vitest';
import { FORECAST_CONFIGS } from '../src/forecast/config';
import { featureNames, issueTime, powerCurve, trailingMean } from '../src/forecast/features';
import type { HourlySeries } from '../src/forecast/history';
import { monthChunks, toHourlySeries } from '../src/forecast/history';
import { buildRows, fitRows, trainForecastModel } from '../src/forecast/model';
import type { HourWeather, WeatherByLead } from '../src/forecast/openMeteo';
import { describeDay, horizonDays, makeForecast } from '../src/forecast/predict';
import { RidgeAccumulator, predict } from '../src/forecast/ridge';

const H = 3_600_000;
const cfg = FORECAST_CONFIGS.find((c) => c.country === 'pl')!;

describe('ridge', () => {
  it('recovers a linear relationship', () => {
    const acc = new RidgeAccumulator(['a', 'b']);
    for (let i = 0; i < 500; i++) {
      const a = Math.sin(i);
      const b = Math.cos(i * 0.7);
      acc.add([a, b], 3 + 2 * a - 5 * b);
    }
    const m = acc.fit(1e-9);
    expect(predict(m, [0.5, -0.2])).toBeCloseTo(3 + 1 + 1, 4);
  });
});

describe('features', () => {
  it('maps wind speed to turbine output', () => {
    expect(powerCurve(2)).toBe(0);
    expect(powerCurve(12)).toBe(1);
    expect(powerCurve(30)).toBe(0);
    expect(powerCurve(7.5)).toBeCloseTo(0.125, 6);
  });

  it('issues forecasts at local midnight h days before the target day', () => {
    // 2026-11-27 15:00 Warsaw (UTC+1) = 14:00Z; local midnight = 2026-11-26T23:00Z.
    const target = Date.parse('2026-11-27T14:00:00Z');
    expect(new Date(issueTime(target, 0, 'Europe/Warsaw')).toISOString()).toBe('2026-11-26T23:00:00.000Z');
    expect(new Date(issueTime(target, 2, 'Europe/Warsaw')).toISOString()).toBe('2026-11-24T23:00:00.000Z');
  });

  it('needs at least half a week of history for the anchor', () => {
    const issue = Date.parse('2026-11-20T00:00:00Z');
    const s: HourlySeries = new Map();
    for (let t = issue - 7 * 24 * H; t < issue - 5 * 24 * H; t += H) s.set(t, 100);
    expect(trailingMean(s, issue)).toBeNull();
    for (let t = issue - 5 * 24 * H; t < issue; t += H) s.set(t, 200);
    expect(trailingMean(s, issue)).toBeCloseTo((48 * 100 + 120 * 200) / 168, 6);
  });
});

describe('history helpers', () => {
  it('averages quarter-hours into hours and splits months', () => {
    const t0 = Date.parse('2026-01-01T00:00:00Z');
    const s = toHourlySeries([0, 1, 2, 3].map((i) => ({ t: t0 + i * 900_000, v: i * 10 })));
    expect(s.get(t0)).toBe(15);
    expect(monthChunks('2026-01-15', '2026-03-02')).toEqual([
      ['2026-01-15', '2026-01-31'],
      ['2026-02-01', '2026-02-28'],
      ['2026-03-01', '2026-03-02'],
    ]);
  });
});

/** Synthetic world: price falls with wind, rises in the evening; weather forecasts are exact. */
function syntheticWorld(days: number) {
  const start = Date.parse('2026-01-05T00:00:00Z');
  const price: HourlySeries = new Map();
  const co2: HourlySeries = new Map();
  const byHour = new Map<number, HourWeather>();
  for (let t = start; t < start + days * 24 * H; t += H) {
    const i = (t - start) / H;
    const wind = 6 + 5 * Math.sin(i / 37) + 2 * Math.sin(i / 11);
    const hour = new Date(t).getUTCHours();
    const w: HourWeather = {
      wind: cfg.wind.map(() => wind),
      solar: cfg.area.map(() => Math.max(0, 400 * Math.sin(((hour - 6) / 12) * Math.PI))),
      temp: cfg.area.map(() => 3),
    };
    byHour.set(t, w);
    const pc = powerCurve(wind);
    price.set(t, 120 - 90 * pc + (hour >= 16 && hour <= 19 ? 40 : 0));
    co2.set(t, 750 - 400 * pc);
  }
  const weather: WeatherByLead = new Map(Array.from({ length: 7 }, (_, l) => [l + 1, byHour]));
  return { start, price, co2, weather, byHour };
}

describe('model', () => {
  it('learns the synthetic relationship and beats last-week baseline', () => {
    const w = syntheticWorld(120);
    const m = trainForecastModel(cfg, 'price', w.price, w.weather, {
      now: new Date(),
      unit: 'EUR/MWh',
      holdoutWeeks: 3,
    });
    expect(m.ridge.features).toEqual(featureNames(cfg.wind.length));
    for (const h of m.horizons) {
      expect(h.mae).toBeLessThan(h.baselineMae);
      expect(h.mae).toBeLessThan(15);
    }
  });

  it('builds one row per hour and horizon', () => {
    const w = syntheticWorld(30);
    const rows = buildRows(cfg, w.price, w.weather, w.start + 10 * 24 * H, w.start + 13 * 24 * H, [1, 3]);
    expect(rows).toHaveLength(3 * 24 * 2);
    expect(() => fitRows(cfg, rows)).not.toThrow();
  });
});

describe('makeForecast', () => {
  const w = syntheticWorld(80);
  const now = new Date(w.start + 70 * 24 * H + 9 * H);
  const price = trainForecastModel(cfg, 'price', w.price, w.weather, {
    now,
    unit: 'EUR/MWh',
    holdoutWeeks: 2,
  });
  const co2 = trainForecastModel(cfg, 'co2', w.co2, w.weather, { now, unit: 'g/kWh', holdoutWeeks: 2 });

  it('produces 7 local days with bands, prices converted to the output currency', () => {
    const f = makeForecast({
      cfg,
      zone: 'pl',
      price,
      co2,
      weather: w.byHour,
      recentPrice: w.price,
      recentCo2: w.co2,
      fx: 4.25,
      currency: 'PLN',
      now,
      sources: [],
    });
    expect(f.days).toHaveLength(7);
    expect(f.days.map((d) => d.horizon)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(f.price!.points.length).toBeGreaterThanOrEqual(7 * 24 - 1);
    const p = f.price!.points[0]!;
    expect(p.lo).toBeLessThanOrEqual(p.v);
    expect(p.hi).toBeGreaterThanOrEqual(p.v);
    // Synthetic price ~30..160 EUR → in PLN well above 100.
    expect(f.days[0]!.priceAvg!).toBeGreaterThan(100);
    expect(new Set(f.days.map((d) => d.tone)).size).toBeGreaterThan(1);
    expect(f.days[0]!.cheapest3h).not.toBeNull();
    expect(f.days[0]!.summary.length).toBeGreaterThan(5);
  });

  it('uses published day-ahead prices for tomorrow when they exist', () => {
    const [tomorrow] = horizonDays(now.getTime(), cfg.timezone);
    const known: HourlySeries = new Map(tomorrow!.hours.map((h) => [h, 333]));
    const f = makeForecast({
      cfg,
      zone: 'pl',
      price,
      co2,
      weather: w.byHour,
      recentPrice: w.price,
      recentCo2: w.co2,
      knownPrices: known,
      fx: 4.25,
      currency: 'PLN',
      now,
      sources: [],
    });
    expect(f.days[0]!.pricesKnown).toBe(true);
    expect(f.days[0]!.priceAvg).toBe(333);
    expect(f.days[1]!.pricesKnown).toBe(false);
  });
});

describe('horizonDays', () => {
  it('handles the DST change (25-hour day)', () => {
    const days = horizonDays(Date.parse('2026-10-22T10:00:00Z'), 'Europe/Warsaw');
    const oct25 = days.find((d) => d.date === '2026-10-25')!;
    expect(oct25.hours).toHaveLength(25);
    expect(days).toHaveLength(7);
  });
});

describe('describeDay', () => {
  it('explains the day in one line', () => {
    expect(describeDay(0.6, 50, 5, 'cheap')).toBe('Silny wiatr — tani i czystszy prąd przez większość dnia');
    expect(describeDay(0.05, 80, -6, 'expensive')).toBe(
      'Prawie bezwietrznie, pochmurno, mróz — drogo, zwłaszcza wieczorem',
    );
  });
});
