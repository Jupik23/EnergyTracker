import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  SCHEMA_VERSION,
  type CountryCode,
  type CountrySnapshot,
  type DataIndex,
  type IndexEntry,
} from '@energy/core';
import { localDate } from './dates';

/**
 * Static JSON "API" layout, published to the `data` branch:
 *
 *   v1/index.json                      overview of all countries
 *   v1/<cc>/latest.json                full snapshot (mix today, prices, forecast)
 *   v1/<cc>/history/<YYYY-MM-DD>.json  daily mix archive (rewritten during the day)
 */
export const HISTORY_DAYS = 90;

export async function writeSnapshot(root: string, s: CountrySnapshot): Promise<void> {
  const dir = join(root, 'v1', s.country);
  const historyDir = join(dir, 'history');
  await mkdir(historyDir, { recursive: true });
  await writeJson(join(dir, 'latest.json'), s);

  const day = localDate(new Date(s.generatedAt), s.timezone);
  if (s.mix.length > 0) {
    await writeJson(join(historyDir, `${day}.json`), {
      schemaVersion: SCHEMA_VERSION,
      country: s.country,
      date: day,
      mix: s.mix,
    });
  }
  await pruneHistory(historyDir, day);
}

async function pruneHistory(dir: string, today: string): Promise<void> {
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - HISTORY_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  for (const f of await readdir(dir)) {
    if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) < cutoffStr) {
      await rm(join(dir, f));
    }
  }
}

export async function readIndex(root: string): Promise<DataIndex | null> {
  try {
    return JSON.parse(await readFile(join(root, 'v1', 'index.json'), 'utf8')) as DataIndex;
  } catch {
    return null;
  }
}

/**
 * Merges this run's results into the previous index so a country whose
 * upstream failed keeps its last good timestamp (marked ok: false).
 */
export function mergeIndex(prev: DataIndex | null, results: IndexEntry[], now: Date): DataIndex {
  const byCountry = new Map<CountryCode, IndexEntry>();
  for (const e of prev?.countries ?? []) byCountry.set(e.country, e);
  for (const r of results) {
    const old = byCountry.get(r.country);
    byCountry.set(r.country, r.ok ? r : { ...old, ...r, updatedAt: old?.updatedAt ?? r.updatedAt });
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    countries: [...byCountry.values()],
  };
}

export async function writeIndex(root: string, index: DataIndex): Promise<void> {
  await mkdir(join(root, 'v1'), { recursive: true });
  await writeJson(join(root, 'v1', 'index.json'), index);
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(data) + '\n', 'utf8');
}
