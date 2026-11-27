import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchJson } from '../http';

export type Fetcher = <T>(url: string) => Promise<T>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wraps a fetcher with a minimum delay between requests to the same host.
 * Energy-Charts answers 429 to a few requests per second, and Open-Meteo
 * counts long multi-variable requests as many calls (600/min on the free tier).
 */
export function politeFetcher(minGapMs: Record<string, number>, base: Fetcher = fetchJson): Fetcher {
  const last = new Map<string, number>();
  return async <T>(url: string) => {
    const host = new URL(url).host;
    const gap = minGapMs[host] ?? 2_500;
    const wait = (last.get(host) ?? 0) + gap - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await base<T>(url);
    } finally {
      last.set(host, Date.now());
    }
  };
}

/** Disk cache for development and back-testing, so re-runs do not hit the APIs again. */
export function cachedFetcher(dir: string, base: Fetcher): Fetcher {
  return async <T>(url: string) => {
    const file = join(dir, createHash('sha1').update(url).digest('hex') + '.json');
    try {
      return JSON.parse(await readFile(file, 'utf8')) as T;
    } catch {
      const data = await base<T>(url);
      await mkdir(dir, { recursive: true });
      await writeFile(file, JSON.stringify(data));
      return data;
    }
  };
}

export const DEFAULT_GAPS: Record<string, number> = {
  'api.energy-charts.info': 3_000,
  'previous-runs-api.open-meteo.com': 20_000,
  'api.open-meteo.com': 1_000,
  'api.raporty.pse.pl': 1_000,
};
