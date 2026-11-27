import {
  SCHEMA_VERSION,
  addDays,
  countryByCode,
  localDate,
  type MixPoint,
  type Point,
  type PriceSeries,
  type SourceRef,
  type Zone,
  type ZoneSnapshot,
} from '@energy/core';
import { ENERGY_CHARTS_SOURCE, fetchCo2, fetchPrice, fetchPublicPower } from './sources/energyCharts';
import { PSE_SOURCE, fetchRce } from './sources/pse';
import { fromToday, needsCo2Refresh, needsPriceRefresh } from './refresh';

export interface BuildOptions {
  now?: Date;
  log?: (msg: string) => void;
  /** Snapshots from the previous run, by zone id — the cache for prices and forecasts. */
  previous?: Map<string, ZoneSnapshot>;
}

/**
 * Builds snapshots for every zone of one country. The generation mix is
 * per country and required (fetched every run). Prices are per zone and the
 * CO₂ forecast per country; both are re-fetched only when stale and fall back
 * to the previous run's values if the upstream call fails.
 */
export async function buildCountry(
  countryCode: string,
  zones: Zone[],
  opts: BuildOptions = {},
): Promise<ZoneSnapshot[]> {
  const now = opts.now ?? new Date();
  const log = opts.log ?? (() => {});
  const previous: Map<string, ZoneSnapshot> = opts.previous ?? new Map();
  const { timezone, hasMix } = countryByCode(countryCode);
  const today = localDate(now, timezone);
  const tomorrow = addDays(today, 1);

  // Mix is per country. If it fails, keep today's cached mix and still publish prices;
  // a zone only fails when there is neither mix nor prices.
  let mix: MixPoint[] = [];
  let intervalMinutes = 15;
  let mixError: unknown = null;
  try {
    if (!hasMix) throw new Error('no generation mix published for this country');
    ({ mix, intervalMinutes } = await fetchPublicPower(countryCode, today, today));
  } catch (err) {
    mixError = err;
    const cached = zones.map((z) => previous.get(z.id)).find((s) => s && s.mix.length > 0);
    mix = (cached?.mix ?? []).filter((p) => localDate(p.t, timezone) === today);
    intervalMinutes = cached?.intervalMinutes ?? 15;
    log(`[${countryCode}] mix unavailable (${String(err)}), using ${mix.length} cached points`);
  }

  // CO₂ forecast is per country: reuse the newest cached copy from any of its zones.
  const prevCountry = zones.map((z) => previous.get(z.id)).find((s) => s?.co2ForecastFetchedAt);
  let co2Forecast: Point[] = prevCountry?.co2Forecast ?? [];
  let co2Measured: Point[] = prevCountry?.co2Measured ?? [];
  let co2ForecastFetchedAt = prevCountry?.co2ForecastFetchedAt;
  if (needsCo2Refresh(co2ForecastFetchedAt, now, countryCode)) {
    try {
      ({ measured: co2Measured, forecast: co2Forecast } = await fetchCo2(countryCode));
      co2ForecastFetchedAt = now.toISOString();
    } catch (err) {
      log(`[${countryCode}] CO2 forecast unavailable, keeping cached: ${String(err)}`);
    }
  }
  co2Measured = fromToday(co2Measured, now, timezone);
  const lastMeasured = [mix.at(-1)?.t, co2Measured.at(-1)?.t].filter(Boolean).sort().at(-1);
  co2Forecast = co2Forecast.filter((p) => !lastMeasured || p.t > lastMeasured);

  const out: ZoneSnapshot[] = [];
  for (const zone of zones) {
    const prev = previous.get(zone.id);
    const sources: SourceRef[] = [ENERGY_CHARTS_SOURCE];
    const prices: PriceSeries[] = [];

    const prevEur = prev?.prices.find((p) => p.currency === 'EUR');
    const eur = await refreshed(prevEur, now, timezone, log, `${zone.id} EUR`, async () => ({
      unit: 'EUR/MWh',
      currency: 'EUR',
      source: ENERGY_CHARTS_SOURCE.name,
      points: await fetchPrice(zone.biddingZone, today, tomorrow),
    }));

    if (zone.country === 'pl') {
      const prevPln = prev?.prices.find((p) => p.currency === 'PLN');
      const pln = await refreshed(prevPln, now, timezone, log, `${zone.id} PLN`, async () => ({
        unit: 'PLN/MWh',
        currency: 'PLN',
        source: PSE_SOURCE.name,
        points: await fetchRce([today, tomorrow]),
      }));
      if (pln && pln.points.length > 0) {
        prices.push(pln);
        sources.push(PSE_SOURCE);
      }
    }
    if (eur) prices.push(eur);

    out.push({
      schemaVersion: SCHEMA_VERSION,
      country: countryCode,
      zone: zone.id,
      biddingZone: zone.biddingZone,
      timezone,
      intervalMinutes,
      generatedAt: now.toISOString(),
      mix,
      prices,
      co2Measured,
      co2Forecast,
      co2ForecastFetchedAt,
      sources,
    });
  }
  if (mixError && mix.length === 0 && out.every((s) => s.prices.every((p) => p.points.length === 0))) {
    throw mixError;
  }
  return out;
}

/** Re-fetches a price series when stale; on failure keeps the cached copy. Always trims to today onwards. */
async function refreshed(
  prev: PriceSeries | undefined,
  now: Date,
  timeZone: string,
  log: (m: string) => void,
  label: string,
  fetcher: () => Promise<Omit<PriceSeries, 'fetchedAt'>>,
): Promise<PriceSeries | undefined> {
  let series = prev;
  if (needsPriceRefresh(prev, now, timeZone)) {
    try {
      const fresh = await fetcher();
      // An empty answer (e.g. a zone with no auction today) must not wipe good cached data.
      series = fresh.points.length > 0 || !prev ? { ...fresh, fetchedAt: now.toISOString() } : prev;
    } catch (err) {
      log(`[${label}] price refresh failed, keeping cached: ${String(err)}`);
    }
  }
  return series && { ...series, points: fromToday(series.points, now, timeZone) };
}
