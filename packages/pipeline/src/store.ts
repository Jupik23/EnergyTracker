import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  SCHEMA_VERSION,
  localDate,
  type DataIndex,
  type ArchiveDay,
  type IndexEntry,
  type ZoneSnapshot,
} from '@energy/core';

/**
 * Static JSON "API" layout, published to the `data` branch:
 *
 *   v1/index.json                        overview of all zones
 *   v1/<zone>/latest.json                full snapshot (mix today, prices, forecast)
 *   v1/<zone>/history/<YYYY-MM-DD>.json  daily mix + prices archive (rewritten during the day)
 */
export const HISTORY_DAYS = 90;

export async function readSnapshot(root: string, zone: string): Promise<ZoneSnapshot | null> {
  try {
    return JSON.parse(await readFile(join(root, 'v1', zone, 'latest.json'), 'utf8')) as ZoneSnapshot;
  } catch {
    return null;
  }
}

export async function writeSnapshot(root: string, s: ZoneSnapshot): Promise<void> {
  const zone = s.zone ?? s.country;
  const dir = join(root, 'v1', zone);
  const historyDir = join(dir, 'history');
  await mkdir(historyDir, { recursive: true });
  await writeJson(join(dir, 'latest.json'), s);

  const day = localDate(s.generatedAt, s.timezone);
  if (s.mix.length > 0) {
    const history: ArchiveDay = {
      schemaVersion: SCHEMA_VERSION,
      zone,
      country: s.country,
      date: day,
      mix: s.mix,
      prices: s.prices.map((p) => ({
        ...p,
        points: p.points.filter((pt) => localDate(pt.t, s.timezone) === day),
      })),
    };
    await writeJson(join(historyDir, `${day}.json`), history);
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
    const raw = JSON.parse(await readFile(join(root, 'v1', 'index.json'), 'utf8')) as Partial<DataIndex>;
    // Index files written before zones existed have no `zones` array; start fresh.
    return Array.isArray(raw.zones) ? (raw as DataIndex) : null;
  } catch {
    return null;
  }
}

/**
 * Merges this run's results into the previous index so a zone whose
 * upstream failed keeps its last good timestamp (marked ok: false).
 */
export function mergeIndex(prev: DataIndex | null, results: IndexEntry[], now: Date): DataIndex {
  const byZone = new Map<string, IndexEntry>();
  for (const e of prev?.zones ?? []) byZone.set(e.zone, e);
  for (const r of results) {
    const old = byZone.get(r.zone);
    byZone.set(r.zone, r.ok ? r : { ...old, ...r, updatedAt: old?.updatedAt ?? r.updatedAt });
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    zones: [...byZone.values()],
  };
}

export async function writeIndex(root: string, index: DataIndex): Promise<void> {
  await mkdir(join(root, 'v1'), { recursive: true });
  await writeJson(join(root, 'v1', 'index.json'), index);
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(data) + '\n', 'utf8');
}
