import { describe, expect, it } from 'vitest';
import regions from '../data/regions.json';
import { ZONES, findRegion, type RegionSet } from '../src';

const set = regions as unknown as RegionSet;

describe('regions.json', () => {
  it('covers every zone', () => {
    const zones = new Set(set.regions.map((r) => r.z));
    for (const z of ZONES) expect(zones.has(z.id), z.id).toBe(true);
  });
});

describe('findRegion (real coordinates)', () => {
  it.each([
    ['Kraków', 19.94, 50.06, 'pl'],
    ['Gdańsk', 18.65, 54.35, 'pl'],
    ['Berlin', 13.4, 52.52, 'de'],
    ['Paris', 2.35, 48.86, 'fr'],
    ['Lisboa', -9.14, 38.72, 'pt'],
    ['Dublin', -6.26, 53.35, 'ie'],
    ['Luleå', 22.15, 65.58, 'se1'],
    ['Umeå', 20.26, 63.83, 'se2'],
    ['Stockholm', 18.07, 59.33, 'se3'],
    ['Malmö', 13.0, 55.6, 'se4'],
    ['Oslo', 10.75, 59.91, 'no1'],
    ['Stavanger', 5.73, 58.97, 'no2'],
    ['Trondheim', 10.4, 63.43, 'no3'],
    ['Tromsø', 18.96, 69.65, 'no4'],
    ['Bergen', 5.32, 60.39, 'no5'],
    ['Aarhus', 10.2, 56.16, 'dk1'],
    ['København', 12.57, 55.68, 'dk2'],
    ['Milano', 9.19, 45.46, 'it-north'],
    ['Firenze', 11.26, 43.77, 'it-centre-north'],
    ['Roma', 12.5, 41.9, 'it-centre-south'],
    ['Napoli', 14.27, 40.85, 'it-centre-south'],
    ['Bari', 16.87, 41.12, 'it-south'],
    ['Reggio Calabria', 15.65, 38.11, 'it-calabria'],
    ['Palermo', 13.36, 38.12, 'it-sicily'],
    ['Cagliari', 9.11, 39.22, 'it-sardinia'],
  ])('%s → %s', (_name, lon, lat, zone) => {
    expect(findRegion(set, lon, lat)?.zone).toBe(zone);
  });

  it('names the Polish voivodeship', () => {
    expect(findRegion(set, 19.94, 50.06)).toMatchObject({ region: 'województwo małopolskie', exact: true });
  });

  it('snaps points just off the simplified coast to the nearest region', () => {
    // Hel peninsula tip, thin enough to fall outside a 2 km-simplified outline
    const m = findRegion(set, 18.8, 54.6);
    expect(m?.country).toBe('pl');
  });

  it('returns null outside supported countries', () => {
    expect(findRegion(set, -0.12, 51.5)).toBeNull(); // London
    expect(findRegion(set, 30.5, 50.45)).toBeNull(); // Kyiv
  });
});
