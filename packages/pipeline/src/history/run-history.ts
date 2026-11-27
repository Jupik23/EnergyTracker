/**
 * Builds the historical archive on the `history` branch
 * (see .github/workflows/update-history.yml).
 *
 *   npm run history -- --out ./hist-out [--from 2023-01] [--to 2026-11] [--countries pl,de] [--force]
 *
 * Defaults to the previous and the current month (the daily run). Months that
 * are already complete on disk are skipped, so a long backfill can be re-run
 * and simply continues where it stopped.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  COUNTRIES,
  buildHistoryMonth,
  dailyFromMonth,
  localDate,
  monthEnd,
  monthRange,
  type HistoryDaily,
  type HistoryIndex,
  type HistoryMonth,
} from '@energy/core';
import { httpStats } from '../http';
import { fetchCo2, fetchPublicPower } from '../sources/energyCharts';

export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** A month is final once the month after it has started (plus the previous month, re-fetched for late data). */
export function isFinal(month: string, currentMonth: string): boolean {
  return month < previousMonth(currentMonth);
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      out: { type: 'string', default: 'hist-out' },
      from: { type: 'string' },
      to: { type: 'string' },
      countries: { type: 'string' },
      force: { type: 'boolean', default: false },
    },
  });
  const root = resolve(process.env.INIT_CWD ?? process.cwd(), values.out!);
  const now = new Date();
  const current = localDate(now, 'Europe/Berlin').slice(0, 7);
  const from = values.from || previousMonth(current);
  const to = values.to || current;
  const wanted = values.countries?.split(',').map((s) => s.trim().toLowerCase());
  const countries = COUNTRIES.filter((c) => c.hasMix && (!wanted || wanted.includes(c.code)));
  const started = Date.now();
  let written = 0;
  let skipped = 0;
  let failed = 0;

  for (const country of countries) {
    const dir = join(root, 'v1', 'history', country.code);
    await mkdir(dir, { recursive: true });

    for (const month of monthRange(from, to)) {
      const path = join(dir, `${month}.json`);
      if (!values.force && isFinal(month, current) && (await exists(path))) {
        skipped++;
        continue;
      }
      const start = `${month}-01`;
      const end = monthEnd(month);
      try {
        const { mix } = await fetchPublicPower(country.code, start, end);
        let co2: Awaited<ReturnType<typeof fetchCo2>>['measured'] = [];
        try {
          co2 = (await fetchCo2(country.code, start, end)).measured;
        } catch (err) {
          console.warn(`[${country.code} ${month}] CO2 unavailable, using computed: ${String(err)}`);
        }
        const m = buildHistoryMonth(country.code, month, country.timezone, mix, co2);
        if (m.hours === 0) {
          console.warn(`[${country.code} ${month}] no data`);
          continue;
        }
        await writeFile(path, JSON.stringify(m) + '\n');
        written++;
        console.log(`[${country.code} ${month}] ${m.hours} h, CO2 ${m.co2Source}`);
      } catch (err) {
        failed++;
        console.error(`[${country.code} ${month}] FAILED: ${String(err)}`);
      }
    }
    await writeDaily(dir, country.code, country.timezone);
  }

  await writeHistoryIndex(root, now);
  console.log(
    `done: ${written} months written, ${skipped} skipped, ${failed} failed in ` +
      `${Math.round((Date.now() - started) / 1000)} s, ${httpStats.requests} requests (${httpStats.rateLimited}× 429)`,
  );
  if (written === 0 && failed > 0) process.exit(1);
}

async function readMonths(dir: string): Promise<HistoryMonth[]> {
  const files = (await readdir(dir)).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort();
  return Promise.all(
    files.map(async (f) => JSON.parse(await readFile(join(dir, f), 'utf8')) as HistoryMonth),
  );
}

async function writeDaily(dir: string, country: string, timezone: string): Promise<void> {
  const months = await readMonths(dir);
  const daily: HistoryDaily = {
    schemaVersion: 1,
    country,
    timezone,
    days: months.flatMap(dailyFromMonth),
  };
  await writeFile(join(dir, 'daily.json'), JSON.stringify(daily) + '\n');
}

async function writeHistoryIndex(root: string, now: Date): Promise<void> {
  const base = join(root, 'v1', 'history');
  const index: HistoryIndex = { schemaVersion: 1, generatedAt: now.toISOString(), countries: {} };
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const months = (await readdir(join(base, entry.name)))
      .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
      .map((f) => f.slice(0, 7))
      .sort();
    if (months.length) index.countries[entry.name] = { months };
  }
  await writeFile(join(base, 'index.json'), JSON.stringify(index) + '\n');
}

if (process.argv[1] && /run-history\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
