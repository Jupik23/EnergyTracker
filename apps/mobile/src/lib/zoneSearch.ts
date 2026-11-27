import { ZONES, countryByCode, type Zone } from '@energy/core';

/** Lower-case and strip diacritics, so "lodz" finds "Łódź" and "malmo" finds "Malmö". */
export function normalize(s: string): string {
  let out = s.toLowerCase().replace(/ł/g, 'l');
  try {
    out = out.normalize('NFD').replace(/[̀-ͯ]/g, '');
  } catch {
    // engines without String.prototype.normalize: plain lower-case match
  }
  return out;
}

export function matchZones(query: string, zones: readonly Zone[] = ZONES): Zone[] {
  const q = normalize(query.trim());
  if (!q) return [...zones];
  return zones.filter((z) =>
    normalize(`${countryByCode(z.country).name} ${z.region} ${z.id} ${z.biddingZone}`).includes(q),
  );
}
