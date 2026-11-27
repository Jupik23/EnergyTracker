import { describe, expect, it } from 'vitest';
import type { DataIndex } from '@energy/core';
import { mergeIndex } from '../src/store';

describe('mergeIndex', () => {
  const now = new Date('2026-11-27T12:15:00Z');
  const prev: DataIndex = {
    schemaVersion: 1,
    generatedAt: '2026-11-27T12:00:00Z',
    zones: [
      {
        zone: 'pl',
        country: 'pl',
        updatedAt: '2026-11-27T12:00:00Z',
        ok: true,
        latest: { t: 'x', co2: 700, renewableShare: 20 },
      },
    ],
  };

  it('keeps last good data when a country fails', () => {
    const idx = mergeIndex(
      prev,
      [{ zone: 'pl', country: 'pl', updatedAt: now.toISOString(), ok: false, error: 'boom' }],
      now,
    );
    expect(idx.zones[0]).toMatchObject({
      zone: 'pl',
      country: 'pl',
      ok: false,
      error: 'boom',
      updatedAt: '2026-11-27T12:00:00Z',
      latest: { co2: 700 },
    });
  });

  it('replaces entries on success and adds new countries', () => {
    const idx = mergeIndex(
      prev,
      [
        { zone: 'pl', country: 'pl', updatedAt: now.toISOString(), ok: true },
        { zone: 'de', country: 'de', updatedAt: now.toISOString(), ok: true },
      ],
      now,
    );
    expect(idx.zones.map((c) => [c.zone, c.updatedAt])).toEqual([
      ['pl', now.toISOString()],
      ['de', now.toISOString()],
    ]);
  });

  it('works without a previous index', () => {
    expect(mergeIndex(null, [], now).zones).toEqual([]);
  });
});

describe('selectZones', () => {
  it('accepts zone ids and country codes', async () => {
    const { selectZones } = await import('../src/run');
    expect(selectZones('pl,se3').map((z) => z.id)).toEqual(['pl', 'se3']);
    expect(selectZones('it').length).toBe(7);
    expect(selectZones(undefined).length).toBeGreaterThan(30);
    expect(() => selectZones('xx')).toThrow();
  });
});

describe('history month finality', () => {
  it('re-fetches the current and previous month, keeps older ones', async () => {
    const { isFinal, previousMonth } = await import('../src/history/run-history');
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(isFinal('2026-11', '2026-11')).toBe(false);
    expect(isFinal('2026-10', '2026-11')).toBe(false);
    expect(isFinal('2026-09', '2026-11')).toBe(true);
  });
});
