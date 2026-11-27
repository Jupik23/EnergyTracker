/**
 * NBP (Narodowy Bank Polski) exchange rates API — free, no key.
 * Docs: https://api.nbp.pl/
 * Used to express EUR day-ahead prices in PLN for the forecast and the
 * one-year price history behind the tariff comparison (RCE is the same
 * auction result quoted in PLN).
 */
import { fetchJson } from '../http';

const BASE = 'https://api.nbp.pl/api/exchangerates/rates/a/eur';

export const NBP_SOURCE = {
  name: 'NBP — kursy średnie (tabela A)',
  url: 'https://api.nbp.pl',
  license: 'Informacja publiczna NBP',
};

interface NbpResponse {
  rates: { effectiveDate: string; mid: number }[];
}

type Fetcher = <T>(url: string) => Promise<T>;

export async function fetchLatestEurPln(get: Fetcher = fetchJson): Promise<number> {
  const res = await get<NbpResponse>(`${BASE}/?format=json`);
  const mid = res.rates.at(-1)?.mid;
  if (!mid) throw new Error('NBP: no EUR rate');
  return mid;
}

/**
 * Daily EUR/PLN mid rates for [start, end] (YYYY-MM-DD, at most 367 days per
 * request). Days without a fixing (weekends, holidays) take the previous rate.
 */
export async function fetchEurPlnRange(
  start: string,
  end: string,
  get: Fetcher = fetchJson,
): Promise<(date: string) => number | undefined> {
  // Start a week earlier so the first days have a "previous" fixing; the API
  // allows at most 367 days per request, so longer ranges are split.
  const DAY = 86_400_000;
  let from = Date.parse(`${start}T00:00:00Z`) - 7 * DAY;
  const last = Date.parse(`${end}T00:00:00Z`);
  const all: NbpResponse['rates'] = [];
  while (from <= last) {
    const to = Math.min(from + 360 * DAY, last);
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const res = await get<NbpResponse>(`${BASE}/${iso(from)}/${iso(to)}/?format=json`);
    all.push(...res.rates);
    from = to + DAY;
  }
  const rates = all.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  return (date: string) => {
    let hit: number | undefined;
    for (const r of rates) {
      if (r.effectiveDate <= date) hit = r.mid;
      else break;
    }
    return hit;
  };
}
