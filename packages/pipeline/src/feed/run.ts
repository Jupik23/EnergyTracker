/**
 * Writes `v1/<zone>/feed.json` next to every published snapshot.
 *
 *   npx tsx packages/pipeline/src/feed/run.ts --out data-out
 *
 * Runs after the main pipeline in the same workflow, reading what it just
 * wrote, so it never adds requests to upstream APIs.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildFeed, type SnapshotLike } from './build';

interface IndexLike {
  zones?: { zone: string; ok: boolean }[];
  countries?: { country: string; ok: boolean }[];
}

async function main() {
  const { values } = parseArgs({ options: { out: { type: 'string', default: 'data-out' } } });
  const root = resolve(process.env.INIT_CWD ?? process.cwd(), values.out!);
  const index = JSON.parse(await readFile(join(root, 'v1', 'index.json'), 'utf8')) as IndexLike;
  const ids = index.zones?.map((z) => z.zone) ?? index.countries?.map((c) => c.country) ?? [];
  const now = new Date();
  let written = 0;
  for (const id of ids) {
    try {
      const snap = JSON.parse(await readFile(join(root, 'v1', id, 'latest.json'), 'utf8')) as SnapshotLike;
      const feed = buildFeed(snap, now);
      await writeFile(join(root, 'v1', id, 'feed.json'), JSON.stringify(feed) + '\n', 'utf8');
      written++;
    } catch (err) {
      console.warn(`[${id}] feed skipped: ${String(err)}`);
    }
  }
  console.log(`feed: ${written}/${ids.length} zones`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
