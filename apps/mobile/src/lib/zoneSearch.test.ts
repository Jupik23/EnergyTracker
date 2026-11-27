import { describe, expect, it } from 'vitest';
import { matchZones, normalize } from './zoneSearch';

describe('zone search', () => {
  it('ignores case and diacritics', () => {
    expect(normalize('Łódź Malmö')).toBe('lodz malmo');
  });

  it('finds countries, regions and zone codes', () => {
    expect(matchZones('szwecja').map((z) => z.id)).toEqual(['se1', 'se2', 'se3', 'se4']);
    expect(matchZones('sztokholm').map((z) => z.id)).toEqual(['se3']);
    expect(matchZones('SE4').map((z) => z.id)).toEqual(['se4']);
    expect(matchZones('sycylia').map((z) => z.id)).toEqual(['it-sicily']);
    expect(matchZones('polska').map((z) => z.id)).toEqual(['pl']);
  });

  it('returns everything for an empty query and nothing for nonsense', () => {
    expect(matchZones('  ').length).toBeGreaterThan(40);
    expect(matchZones('xyzzy')).toEqual([]);
  });
});
