import {
  SCHEMA_VERSION,
  countryConfig,
  type CountryCode,
  type CountrySnapshot,
  type PriceSeries,
  type SourceRef,
} from '@energy/core';
import { addDays, localDate } from './dates';
import { pause } from './http';
import { ENERGY_CHARTS_SOURCE, fetchCo2Forecast, fetchPrice, fetchPublicPower } from './sources/energyCharts';
import { PSE_SOURCE, fetchRce } from './sources/pse';

export interface BuildOptions {
  now?: Date;
  log?: (msg: string) => void;
}

/**
 * Collects everything for one country. Generation mix and EUR prices are
 * required; PLN prices (PSE) and the CO₂ forecast are optional extras whose
 * failure is logged but does not fail the snapshot.
 */
export async function buildSnapshot(code: CountryCode, opts: BuildOptions = {}): Promise<CountrySnapshot> {
  const now = opts.now ?? new Date();
  const log = opts.log ?? (() => {});
  const cfg = countryConfig(code);
  const today = localDate(now, cfg.timezone);
  const tomorrow = addDays(today, 1);
  const sources: SourceRef[] = [ENERGY_CHARTS_SOURCE];

  const mix = await fetchPublicPower(code, today, today);
  await pause();
  const eur = await fetchPrice(cfg.biddingZone, today, tomorrow);
  const prices: PriceSeries[] = [
    { unit: 'EUR/MWh', currency: 'EUR', source: ENERGY_CHARTS_SOURCE.name, points: eur },
  ];

  if (code === 'pl') {
    try {
      const pln = await fetchRce([today, tomorrow]);
      if (pln.length > 0) {
        prices.unshift({ unit: 'PLN/MWh', currency: 'PLN', source: PSE_SOURCE.name, points: pln });
        sources.push(PSE_SOURCE);
      }
    } catch (err) {
      log(`[${code}] PSE RCE unavailable: ${String(err)}`);
    }
  }

  let co2Forecast: CountrySnapshot['co2Forecast'] = [];
  try {
    await pause();
    co2Forecast = await fetchCo2Forecast(code);
  } catch (err) {
    log(`[${code}] CO2 forecast unavailable: ${String(err)}`);
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    country: code,
    timezone: cfg.timezone,
    intervalMinutes: 15,
    generatedAt: now.toISOString(),
    mix,
    prices,
    co2Forecast,
    sources,
  };
}
