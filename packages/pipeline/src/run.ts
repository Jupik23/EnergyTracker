/**
 * Entry point for the scheduled job (see .github/workflows/update-data.yml).
 *
 *   npm run pipeline -- --out ./data-out [--countries pl,de]
 *
 * Exits non-zero only when every country failed, so one flaky upstream does
 * not block publishing the others.
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { COUNTRIES, type CountryCode, type IndexEntry } from '@energy/core';
import { pause } from './http';
import { buildSnapshot } from './snapshot';
import { mergeIndex, readIndex, writeIndex, writeSnapshot } from './store';

async function main() {
  const { values } = parseArgs({
    options: {
      out: { type: 'string', default: 'data-out' },
      countries: { type: 'string', default: COUNTRIES.map((c) => c.code).join(',') },
    },
  });
  // npm workspaces run scripts inside the package dir; resolve against where the user ran npm.
  const root = resolve(process.env.INIT_CWD ?? process.cwd(), values.out!);
  const codes = values.countries!.split(',').map((s) => s.trim()) as CountryCode[];
  const now = new Date();
  const results: IndexEntry[] = [];

  for (const [i, code] of codes.entries()) {
    if (i > 0) await pause(3_000);
    try {
      const snap = await buildSnapshot(code, { now, log: console.warn });
      await writeSnapshot(root, snap);
      const last = snap.mix.at(-1);
      results.push({
        country: code,
        updatedAt: now.toISOString(),
        ok: true,
        latest: last && { t: last.t, co2: last.co2, renewableShare: last.renewableShare },
      });
      console.log(
        `[${code}] ok — ${snap.mix.length} mix points, ` +
          snap.prices.map((p) => `${p.points.length} ${p.currency}`).join(', ') +
          `, ${snap.co2Forecast.length} forecast`,
      );
    } catch (err) {
      console.error(`[${code}] FAILED: ${String(err)}`);
      results.push({ country: code, updatedAt: now.toISOString(), ok: false, error: String(err) });
    }
  }

  await writeIndex(root, mergeIndex(await readIndex(root), results, now));
  if (results.every((r) => !r.ok)) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
