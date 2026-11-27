/**
 * Runs the Shelly script (integrations/shelly/energytracker.js) against a
 * mocked Shelly runtime, so a broken script is caught here and not on
 * someone's water heater.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildFeed, type Feed } from '../src/feed/build';

const SCRIPT = readFileSync(
  fileURLToPath(new URL('../../../integrations/shelly/energytracker.js', import.meta.url)),
  'utf8',
);
const H = 3_600_000;

interface Run {
  switches: boolean[];
}

function run(feed: Feed | null, nowMs: number, config: Record<string, unknown> = {}): Run {
  const switches: boolean[] = [];
  const Shelly = {
    getComponentStatus: () => ({ unixtime: Math.floor(nowMs / 1000) }),
    call: (method: string, params: Record<string, unknown>, cb?: (res: unknown, err: number) => void) => {
      if (method === 'Switch.Set') switches.push(params.on as boolean);
      if (method === 'HTTP.GET') {
        cb?.(feed ? { code: 200, body: JSON.stringify(feed) } : { code: 500, body: '' }, feed ? 0 : -1);
      }
    },
  };
  const Timer = { set: () => 1 };
  const overrides = Object.entries(config)
    .map(([k, v]) => `CONFIG.${k} = ${JSON.stringify(v)};`)
    .join('\n');
  // Apply overrides before the first tick: run everything up to the final `tick();` call.
  const body = SCRIPT.replace(/\ntick\(\);\s*$/, `\n${overrides}\ntick();\n`);
  new Function('Shelly', 'Timer', 'print', body)(Shelly, Timer, () => {});
  return { switches };
}

const t0 = Date.parse('2026-11-27T00:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

function feedAt(nowMs: number): Feed {
  const prices = Array.from({ length: 48 }, (_, h) => ({
    t: iso(t0 + h * H),
    v: h >= 2 && h < 5 ? 100 : 500,
  }));
  return buildFeed(
    {
      country: 'pl',
      timezone: 'Europe/Warsaw',
      mix: [{ t: iso(nowMs - H), co2: 600, renewableShare: 25 }],
      prices: [{ currency: 'PLN', points: prices }],
      co2Forecast: [],
    },
    new Date(nowMs),
  );
}

describe('Shelly script', () => {
  it('switches on inside the cheapest 3-hour window and off outside it', () => {
    const before = t0 + 1 * H;
    expect(run(feedAt(before), before).switches).toEqual([false]);
    const inside = t0 + 3 * H + 10 * 60_000;
    expect(run(feedAt(inside), inside).switches).toEqual([true]);
  });

  it('supports the price threshold mode', () => {
    const at = t0 + 2 * H;
    expect(run(feedAt(at), at, { mode: 'below', maxPrice: 0.2 }).switches).toEqual([true]);
    const later = t0 + 6 * H;
    expect(run(feedAt(later), later, { mode: 'below', maxPrice: 0.2 }).switches).toEqual([false]);
  });

  it('does nothing on a failed download until the failsafe period passes', () => {
    expect(run(null, t0).switches).toEqual([]);
  });
});
