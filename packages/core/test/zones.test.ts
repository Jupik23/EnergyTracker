import { describe, expect, it } from 'vitest';
import { COUNTRIES, ZONES, countryByCode, flagEmoji, findZone, zoneName, zonesOfCountry } from '../src';

describe('zone registry', () => {
  it('has unique zone ids and bidding zones', () => {
    expect(new Set(ZONES.map((z) => z.id)).size).toBe(ZONES.length);
    expect(new Set(ZONES.map((z) => z.biddingZone)).size).toBe(ZONES.length);
  });

  it('every zone belongs to a known country, every country has a zone', () => {
    for (const z of ZONES) expect(() => countryByCode(z.country)).not.toThrow();
    for (const c of COUNTRIES) expect(zonesOfCountry(c.code).length).toBeGreaterThan(0);
  });

  it('keeps the original v1 ids for backwards compatibility', () => {
    for (const id of ['pl', 'de', 'fr', 'cz']) expect(findZone(id)).toBeDefined();
  });

  it('single-zone countries use the country code as zone id', () => {
    for (const z of ZONES) if (!z.region) expect(z.id).toBe(z.country);
  });

  it('formats names and flags', () => {
    expect(zoneName(findZone('pl')!)).toBe('Polska');
    expect(zoneName(findZone('se3')!)).toBe('Szwecja · SE3 — Sztokholm');
    expect(flagEmoji('pl')).toBe('🇵🇱');
  });
});
