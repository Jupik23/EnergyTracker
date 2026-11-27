/**
 * Back-test of the 7-day forecast on archived weather forecasts.
 *
 *   npx tsx packages/pipeline/src/forecast/backtest.ts --country pl \
 *     --from 2024-01-01 --to 2026-11-25 --split 2026-05-01 --cache .cache/forecast
 *
 * Trains on [from, split) and reports, for each horizon on [split, to]:
 * MAE vs the "same hour last week" baseline, and the regret of picking the
 * forecast's cheapest/cleanest 3-hour window of the day.
 */
import { parseArgs } from 'node:util';
import { forecastConfig } from './config';
import { DEFAULT_GAPS, cachedFetcher, politeFetcher } from './fetchers';
import { fetchCo2History, fetchPriceHistory, type HourlySeries } from './history';
import { buildRows, evaluate, fitRows, windowRegret, type Target } from './model';
import { loadWeatherHistory } from './load';
import type { WeatherByLead } from './openMeteo';

let HALF_LIFE: number | undefined;

const fmt = (x: number, d = 1) => x.toFixed(d).padStart(7);

function report(
  name: Target,
  unit: string,
  cfg: NonNullable<ReturnType<typeof forecastConfig>>,
  series: HourlySeries,
  weather: WeatherByLead,
  splitMs: number,
  toMs: number,
) {
  const fromMs = Math.min(...series.keys());
  const train = buildRows(cfg, series, weather, fromMs, splitMs);
  const test = buildRows(cfg, series, weather, splitMs, toMs);
  const model = fitRows(cfg, train, 1e-3, HALF_LIFE);
  const stats = evaluate(cfg, model, series, test, name === 'co2' ? 0 : undefined);
  const regret = windowRegret(cfg, model, series, test, 3);
  console.log(`\n=== ${name} (${unit}) — train ${train.length} rows, test ${test.length} rows`);
  console.log(
    ' dzień |  MAE model | MAE baseline | skill | p10..p90       | strata okna 3h: model / baseline',
  );
  for (const s of stats) {
    const r = regret.find((x) => x.horizon === s.horizon);
    const skill = (1 - s.mae / s.baselineMae) * 100;
    console.log(
      `  +${s.horizon}   | ${fmt(s.mae)}    | ${fmt(s.baselineMae)}      | ${fmt(skill, 0)}% | ${fmt(s.p10)}..${fmt(s.p90)} | ${r ? `${fmt(r.model)} / ${fmt(r.baseline)}  (${r.days} dni)` : ''}`,
    );
  }
  const top = model.features
    .map((f, i) => ({ f, c: model.coef[i]! }))
    .sort((a, b) => Math.abs(b.c) - Math.abs(a.c))
    .slice(0, 10);
  console.log(
    '  największe współczynniki (na std. cechach):',
    top.map((t) => `${t.f}=${t.c.toFixed(1)}`).join(', '),
  );
}

async function main() {
  const { values } = parseArgs({
    options: {
      country: { type: 'string', default: 'pl' },
      from: { type: 'string', default: '2024-01-01' },
      to: { type: 'string', default: new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10) },
      split: { type: 'string', default: '2026-05-01' },
      cache: { type: 'string' },
      'half-life': { type: 'string' },
    },
  });
  HALF_LIFE = values['half-life'] ? Number(values['half-life']) : undefined;
  const cfg = forecastConfig(values.country!);
  if (!cfg) throw new Error(`No forecast config for ${values.country}`);
  let get = politeFetcher(DEFAULT_GAPS);
  if (values.cache) get = cachedFetcher(values.cache, get);

  console.log('Pobieranie cen…');
  const price = await fetchPriceHistory(cfg.biddingZone, values.from!, values.to!, get);
  console.log(`  ${price.size} godzin. Pobieranie miksu (CO₂)…`);
  const co2 = await fetchCo2History(cfg.country, values.from!, values.to!, get);
  console.log(`  ${co2.size} godzin. Pobieranie archiwalnych prognoz pogody…`);
  const weather = await loadWeatherHistory(cfg, values.from!, values.to!, get);
  console.log(`  ${weather.get(1)!.size} godzin × ${weather.size} wyprzedzeń.`);

  const splitMs = Date.parse(`${values.split}T00:00:00Z`);
  const toMs = Date.parse(`${values.to}T23:00:00Z`) + 3_600_000;
  report('price', 'EUR/MWh', cfg, price, weather, splitMs, toMs);
  report('co2', 'g/kWh', cfg, co2, weather, splitMs, toMs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
