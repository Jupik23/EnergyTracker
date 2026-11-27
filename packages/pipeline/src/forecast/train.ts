/**
 * Weekly training job (see .github/workflows/train-forecast.yml).
 *
 *   npx tsx packages/pipeline/src/forecast/train.ts --out data-out [--cache dir]
 *
 * For every configured country: downloads ~3 years of hourly prices and
 * carbon intensity plus the archived weather forecasts at leads 1..7, fits the
 * price and CO₂ models, measures them on the last 8 weeks, and writes
 *   v1/models/<country>.json           both models + hold-out accuracy
 *   v1/<country>/prices-year.json      last 365 days of hourly prices (tariff comparison)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import type { PricesYear } from '@energy/core';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { FORECAST_CONFIGS } from './config';
import { DEFAULT_GAPS, cachedFetcher, politeFetcher } from './fetchers';
import { fetchCo2History, fetchPriceHistory, toHourlySeries, type HourlySeries } from './history';
import { daysAgo, loadWeatherHistory } from './load';
import { trainForecastModel } from './model';
import { fetchEurPlnRange, NBP_SOURCE } from '../sources/nbp';
import { PSE_SOURCE, fetchRceRange } from '../sources/pse';

/** Open-Meteo's archive of previous forecast runs starts in early 2024. */
const ARCHIVE_START = '2024-01-01';
const HOUR = 3_600_000;

async function main() {
  const { values } = parseArgs({
    options: {
      out: { type: 'string', default: 'data-out' },
      cache: { type: 'string' },
      countries: { type: 'string' },
    },
  });
  const root = resolve(process.env.INIT_CWD ?? process.cwd(), values.out!);
  let get = politeFetcher(DEFAULT_GAPS);
  if (values.cache) get = cachedFetcher(values.cache, get);
  const now = new Date();
  const to = daysAgo(now, 2); // archived forecasts and measurements settle after a day or two
  const wanted = values.countries?.split(',');

  for (const cfg of FORECAST_CONFIGS.filter((c) => !wanted || wanted.includes(c.country))) {
    console.log(`[${cfg.country}] downloading history ${ARCHIVE_START}..${to}`);
    const price = await fetchPriceHistory(cfg.biddingZone, ARCHIVE_START, to, get);
    const co2 = await fetchCo2History(cfg.country, ARCHIVE_START, to, get);
    const weather = await loadWeatherHistory(cfg, ARCHIVE_START, to, get);
    console.log(
      `[${cfg.country}] ${price.size} price h, ${co2.size} CO₂ h, ${weather.get(1)?.size ?? 0} weather h`,
    );

    const priceModel = trainForecastModel(cfg, 'price', price, weather, { now, unit: 'EUR/MWh' });
    const co2Model = trainForecastModel(cfg, 'co2', co2, weather, { now, unit: 'g/kWh' });
    for (const m of [priceModel, co2Model]) {
      console.log(
        `[${cfg.country}] ${m.target}: ` +
          m.horizons
            .map((h) => `+${h.horizon}d MAE ${h.mae.toFixed(1)} (baseline ${h.baselineMae.toFixed(1)})`)
            .join(', '),
      );
    }

    await mkdir(join(root, 'v1', 'models'), { recursive: true });
    await writeFile(
      join(root, 'v1', 'models', `${cfg.country}.json`),
      JSON.stringify({ price: priceModel, co2: co2Model }) + '\n',
    );

    const year = await pricesYear(cfg.country, price, now, get);
    await mkdir(join(root, 'v1', cfg.country), { recursive: true });
    await writeFile(join(root, 'v1', cfg.country, 'prices-year.json'), JSON.stringify(year) + '\n');
  }
}

/**
 * Last 365 full days of hourly prices. Poland uses RCE straight from PSE —
 * what dynamic tariffs are actually billed on; Energy-Charts EUR prices
 * converted at the NBP rate differ from it by a few percent, so they are only
 * the fallback when PSE is unavailable.
 */
async function pricesYear(
  country: string,
  eur: HourlySeries,
  now: Date,
  get: ReturnType<typeof politeFetcher>,
): Promise<PricesYear> {
  const end = Date.parse(`${daysAgo(now, 1)}T00:00:00Z`);
  const start = end - 365 * 24 * HOUR;
  const pln = country === 'pl';
  const EC = {
    name: 'Energy-Charts (Fraunhofer ISE)',
    url: 'https://www.energy-charts.info',
    license: 'CC BY 4.0',
  };

  let series: HourlySeries = eur;
  let sources = [EC];
  if (pln) {
    try {
      const rce = await fetchRceRange(daysAgo(new Date(start), 1), daysAgo(new Date(end), 0), get);
      series = toHourlySeries(rce.map((p) => ({ t: Date.parse(p.t), v: p.v })));
      sources = [PSE_SOURCE];
    } catch (err) {
      console.warn(`[pl] RCE history unavailable, converting EUR prices at the NBP rate: ${String(err)}`);
      const rate = await fetchEurPlnRange(daysAgo(new Date(start), 1), daysAgo(new Date(end), 0), get);
      series = new Map(
        [...eur].map(([t, v]) => [t, v * (rate(new Date(t).toISOString().slice(0, 10)) ?? NaN)]),
      );
      sources = [EC, NBP_SOURCE];
    }
  }
  const values: (number | null)[] = [];
  for (let t = start; t < end; t += HOUR) {
    const v = series.get(t);
    values.push(v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
  }
  return {
    schemaVersion: 1,
    zone: country,
    currency: pln ? 'PLN' : 'EUR',
    unit: pln ? 'PLN/MWh' : 'EUR/MWh',
    start: new Date(start).toISOString(),
    values,
    sources,
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
