/**
 * PSE (Polskie Sieci Elektroenergetyczne) public reports API — free, no key.
 * Docs: https://api.raporty.pse.pl/
 * RCE = Rynkowa Cena Energii (PLN/MWh), derived from the day-ahead market,
 * 15-minute resolution. Next-day values are published around 14:00 local time.
 */
import type { Point } from '@energy/core';
import { fetchJson } from '../http';

const BASE = 'https://api.raporty.pse.pl/api';

export const PSE_SOURCE = {
  name: 'PSE S.A. — raporty.pse.pl (RCE)',
  url: 'https://raporty.pse.pl',
  license: 'Informacja publiczna PSE',
};

interface RceRow {
  rce_pln: number | null;
  dtime_utc: string; // end of the interval, "YYYY-MM-DD HH:mm:ss"
  period_utc: string; // "23:00 - 23:15"
}

interface PseResponse<T> {
  value: T[];
  nextLink?: string;
}

const MINUTE = 60_000;

function periodMinutes(period: string): number {
  const m = /^(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})$/.exec(period.trim());
  if (!m) return 15;
  const a = Number(m[1]) * 60 + Number(m[2]);
  let b = Number(m[3]) * 60 + Number(m[4]);
  if (b <= a) b += 24 * 60; // e.g. "23:45 - 00:00"
  return b - a;
}

export function parseRce(rows: RceRow[]): Point[] {
  return rows
    .filter((r) => typeof r.rce_pln === 'number')
    .map((r) => {
      const endMs = Date.parse(r.dtime_utc.replace(' ', 'T') + 'Z');
      return {
        t: new Date(endMs - periodMinutes(r.period_utc) * MINUTE).toISOString(),
        v: r.rce_pln as number,
      };
    })
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

/** Fetches RCE for the given business dates (YYYY-MM-DD, local Polish date). */
export async function fetchRce(dates: string[]): Promise<Point[]> {
  const filter = dates.map((d) => `business_date eq '${d}'`).join(' or ');
  let url: string | undefined =
    `${BASE}/rce-pln?$select=rce_pln,dtime_utc,period_utc&$filter=${encodeURIComponent(filter)}&$first=200`;
  const rows: RceRow[] = [];
  for (let page = 0; url && page < 10; page++) {
    const res: PseResponse<RceRow> = await fetchJson<PseResponse<RceRow>>(url);
    rows.push(...res.value);
    url = res.nextLink;
  }
  return parseRce(rows);
}

/**
 * RCE for a whole date range (local business dates, inclusive), fetched a
 * month per request — the API returns a month of 15-minute rows in one page.
 */
export async function fetchRceRange(
  start: string,
  end: string,
  get: <T>(url: string) => Promise<T> = fetchJson,
): Promise<Point[]> {
  const rows: RceRow[] = [];
  let cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cur <= last) {
    const monthEnd = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0));
    const to = monthEnd < last ? monthEnd : last;
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const filter = `business_date ge '${iso(cur)}' and business_date le '${iso(to)}'`;
    let url: string | undefined =
      `${BASE}/rce-pln?$select=rce_pln,dtime_utc,period_utc&$filter=${encodeURIComponent(filter)}&$first=5000`;
    for (let page = 0; url && page < 10; page++) {
      const res: PseResponse<RceRow> = await get<PseResponse<RceRow>>(url);
      rows.push(...res.value);
      url = res.nextLink;
    }
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  return parseRce(rows);
}
