/**
 * Live 7-day forecast, run as a step of the 15-minute data job.
 *
 *   npx tsx packages/pipeline/src/forecast/run.ts --out data-out [--force]
 *
 * Weather forecasts update a few times a day, so this only does real work when
 * the published forecast is older than REFRESH_HOURS (or the day-ahead prices
 * for tomorrow have appeared since). Needs the models written by train.ts;
 * countries without a model are skipped quietly.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { ForecastFile } from '@energy/core';
import { NBP_SOURCE, fetchLatestEurPln } from '../sources/nbp';
import { FORECAST_CONFIGS, HORIZON_DAYS } from './config';
import { DEFAULT_GAPS, politeFetcher } from './fetchers';
import { fetchCo2History, fetchPriceHistory, toHourlySeries, type HourlySeries } from './history';
import { daysAgo } from './load';
import type { ForecastModel } from './model';
import { OPEN_METEO_SOURCE, fetchWeatherForecast } from './openMeteo';
import { makeForecast } from './predict';

const REFRESH_HOURS = 3;

interface SnapshotPrices {
  prices: { currency: 'PLN' | 'EUR'; points: { t: string; v: number }[] }[];
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function main() {
  const { values } = parseArgs({
    options: { out: { type: 'string', default: 'data-out' }, force: { type: 'boolean', default: false } },
  });
  const root = resolve(process.env.INIT_CWD ?? process.cwd(), values.out!);
  const get = politeFetcher(DEFAULT_GAPS);
  const now = new Date();

  for (const cfg of FORECAST_CONFIGS) {
    const zone = cfg.country;
    const models = await readJson<{ price?: ForecastModel; co2?: ForecastModel }>(
      join(root, 'v1', 'models', `${zone}.json`),
    );
    if (!models) {
      console.log(`[${zone}] no model yet — run train.ts first`);
      continue;
    }

    // Day-ahead prices in the output currency, from the snapshot the main job just wrote.
    const snap = await readJson<SnapshotPrices>(join(root, 'v1', zone, 'latest.json'));
    const series = snap?.prices[0];
    const currency = series?.currency ?? (zone === 'pl' ? 'PLN' : 'EUR');
    const knownPrices: HourlySeries = series
      ? toHourlySeries(series.points.map((p) => ({ t: Date.parse(p.t), v: p.v })))
      : new Map();

    const path = join(root, 'v1', zone, 'forecast.json');
    const prev = await readJson<ForecastFile>(path);
    const ageH = prev ? (now.getTime() - Date.parse(prev.generatedAt)) / 3_600_000 : Infinity;
    const tomorrowNowKnown = prev?.days[0] && !prev.days[0].pricesKnown && knownPrices.size > 30;
    const newModel = prev && prev.modelTrainedAt !== (models.price?.trainedAt ?? models.co2?.trainedAt);
    if (!values.force && ageH < REFRESH_HOURS && !tomorrowNowKnown && !newModel) {
      console.log(`[${zone}] forecast is ${ageH.toFixed(1)} h old — skipping`);
      continue;
    }

    try {
      const from = daysAgo(now, 9);
      const to = daysAgo(now, 0);
      const [weather, recentPrice, recentCo2, fx] = [
        await fetchWeatherForecast(cfg.wind, cfg.area, HORIZON_DAYS + 2, get),
        await fetchPriceHistory(cfg.biddingZone, from, to, get),
        await fetchCo2History(cfg.country, from, to, get),
        currency === 'PLN' ? await fetchLatestEurPln(get) : 1,
      ];
      const forecast = makeForecast({
        cfg,
        zone,
        price: models.price,
        co2: models.co2,
        weather,
        recentPrice,
        recentCo2,
        knownPrices,
        fx,
        currency,
        now,
        sources: [
          OPEN_METEO_SOURCE,
          {
            name: 'Energy-Charts (Fraunhofer ISE)',
            url: 'https://www.energy-charts.info',
            license: 'CC BY 4.0',
          },
          ...(currency === 'PLN' ? [NBP_SOURCE] : []),
        ],
      });
      await writeFile(path, JSON.stringify(forecast) + '\n', 'utf8');
      console.log(
        `[${zone}] forecast: ` +
          forecast.days.map((d) => `${d.date} ${d.tone}${d.pricesKnown ? '*' : ''}`).join(', '),
      );
    } catch (err) {
      // A stale forecast is better than none: keep the previous file.
      console.error(`[${zone}] forecast FAILED: ${String(err)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
