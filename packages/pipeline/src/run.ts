/**
 * Entry point for the scheduled job (see .github/workflows/update-data.yml).
 *
 *   npm run pipeline -- --out ./data-out [--zones pl,se3,it]
 *
 * `--zones` accepts zone ids ("se3") and country codes ("it" = all Italian zones).
 * Exits non-zero only when every zone failed, so one flaky upstream does
 * not block publishing the others.
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ZONES, type IndexEntry, type Zone, type ZoneSnapshot } from '@energy/core';
import { httpStats } from './http';
import { buildCountry } from './snapshot';
import { mergeIndex, readIndex, readSnapshot, writeIndex, writeSnapshot } from './store';

export function selectZones(filter: string | undefined): Zone[] {
  if (!filter) return [...ZONES];
  const wanted = new Set(
    filter
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const zones = ZONES.filter((z) => wanted.has(z.id) || wanted.has(z.country));
  if (zones.length === 0) throw new Error(`No zones match "${filter}"`);
  return zones;
}

async function main() {
  const { values } = parseArgs({
    options: {
      out: { type: 'string', default: 'data-out' },
      zones: { type: 'string' },
    },
  });
  // npm workspaces run scripts inside the package dir; resolve against where the user ran npm.
  const root = resolve(process.env.INIT_CWD ?? process.cwd(), values.out!);
  const zones = selectZones(values.zones);
  const now = new Date();
  const results: IndexEntry[] = [];
  const started = Date.now();

  const byCountry = new Map<string, Zone[]>();
  for (const z of zones) byCountry.set(z.country, [...(byCountry.get(z.country) ?? []), z]);

  for (const [country, countryZones] of byCountry) {
    const previous = new Map<string, ZoneSnapshot>();
    for (const z of countryZones) {
      const s = await readSnapshot(root, z.id);
      if (s) previous.set(z.id, s);
    }
    try {
      const snaps = await buildCountry(country, countryZones, { now, previous, log: console.warn });
      for (const snap of snaps) {
        await writeSnapshot(root, snap);
        const last = snap.mix.at(-1);
        const co2 = snap.co2Measured?.at(-1)?.v ?? last?.co2;
        results.push({
          zone: snap.zone!,
          country,
          updatedAt: now.toISOString(),
          ok: true,
          latest: last && co2 != null ? { t: last.t, co2, renewableShare: last.renewableShare } : undefined,
        });
        console.log(
          `[${snap.zone}] ok — ${snap.mix.length} mix, ` +
            snap.prices.map((p) => `${p.points.length} ${p.currency}`).join(', ') +
            `, ${snap.co2Forecast.length} forecast`,
        );
      }
    } catch (err) {
      console.error(`[${country}] FAILED: ${String(err)}`);
      for (const z of countryZones) {
        results.push({ zone: z.id, country, updatedAt: now.toISOString(), ok: false, error: String(err) });
      }
    }
  }

  await writeIndex(root, mergeIndex(await readIndex(root), results, now));
  const failed = results.filter((r) => !r.ok).length;
  console.log(
    `done: ${results.length - failed}/${results.length} zones ok in ${Math.round((Date.now() - started) / 1000)} s, ` +
      `${httpStats.requests} requests (${httpStats.rateLimited}× HTTP 429, ${httpStats.retries} retries)`,
  );
  if (failed === results.length) process.exit(1);
}

// Only run when executed directly (tests import selectZones).
if (process.argv[1] && /run\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
