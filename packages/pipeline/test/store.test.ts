import { describe, expect, it } from 'vitest';
import type { DataIndex } from '@energy/core';
import { mergeIndex } from '../src/store';

describe('mergeIndex', () => {
  const now = new Date('2026-11-27T12:15:00Z');
  const prev: DataIndex = {
    schemaVersion: 1,
    generatedAt: '2026-11-27T12:00:00Z',
    countries: [
      {
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
      [{ country: 'pl', updatedAt: now.toISOString(), ok: false, error: 'boom' }],
      now,
    );
    expect(idx.countries[0]).toMatchObject({
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
        { country: 'pl', updatedAt: now.toISOString(), ok: true },
        { country: 'de', updatedAt: now.toISOString(), ok: true },
      ],
      now,
    );
    expect(idx.countries.map((c) => [c.country, c.updatedAt])).toEqual([
      ['pl', now.toISOString()],
      ['de', now.toISOString()],
    ]);
  });

  it('works without a previous index', () => {
    expect(mergeIndex(null, [], now).countries).toEqual([]);
  });
});
