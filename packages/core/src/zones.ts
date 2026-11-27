/**
 * Countries and bidding zones.
 *
 * Generation mix (and therefore CO₂) is published per country; day-ahead
 * prices per bidding zone. Most countries are a single zone, a few are split
 * (Nordics, Denmark, Italy). A zone id is what the app selects and what the
 * data files are keyed by: for single-zone countries it equals the country
 * code, so `v1/pl/latest.json` keeps working for older app versions.
 */

export interface Country {
  /** ISO 3166-1 alpha-2, lower case — Energy-Charts `country` parameter. */
  code: string;
  name: string;
  timezone: string;
  /** False when Energy-Charts publishes no generation mix (prices and CO₂ forecast still exist). */
  hasMix: boolean;
}

export interface Zone {
  /** Stable id used in file paths and app settings, e.g. "pl", "se3", "it-north". */
  id: string;
  country: string;
  /** Energy-Charts `bzn` parameter. */
  biddingZone: string;
  /** Region label for split countries, e.g. "Sztokholm"; empty for single-zone countries. */
  region: string;
}

const c = (code: string, name: string, timezone: string, hasMix = true): Country => ({
  code,
  name,
  timezone,
  hasMix,
});

export const COUNTRIES: readonly Country[] = [
  c('pl', 'Polska', 'Europe/Warsaw'),
  c('at', 'Austria', 'Europe/Vienna'),
  c('be', 'Belgia', 'Europe/Brussels'),
  c('bg', 'Bułgaria', 'Europe/Sofia'),
  c('hr', 'Chorwacja', 'Europe/Zagreb'),
  c('cz', 'Czechy', 'Europe/Prague'),
  c('dk', 'Dania', 'Europe/Copenhagen', false), // public_power: 404 for dk, 400 for dk1/dk2 (Nov 2026)
  c('ee', 'Estonia', 'Europe/Tallinn'),
  c('fi', 'Finlandia', 'Europe/Helsinki'),
  c('fr', 'Francja', 'Europe/Paris'),
  c('gr', 'Grecja', 'Europe/Athens'),
  c('es', 'Hiszpania', 'Europe/Madrid'),
  c('nl', 'Holandia', 'Europe/Amsterdam'),
  c('ie', 'Irlandia', 'Europe/Dublin'),
  c('lt', 'Litwa', 'Europe/Vilnius'),
  c('lv', 'Łotwa', 'Europe/Riga'),
  c('de', 'Niemcy', 'Europe/Berlin'),
  c('no', 'Norwegia', 'Europe/Oslo'),
  c('pt', 'Portugalia', 'Europe/Lisbon'),
  c('ro', 'Rumunia', 'Europe/Bucharest'),
  c('rs', 'Serbia', 'Europe/Belgrade'),
  c('sk', 'Słowacja', 'Europe/Bratislava'),
  c('si', 'Słowenia', 'Europe/Ljubljana'),
  c('ch', 'Szwajcaria', 'Europe/Zurich'),
  c('se', 'Szwecja', 'Europe/Stockholm'),
  c('hu', 'Węgry', 'Europe/Budapest'),
  c('it', 'Włochy', 'Europe/Rome'),
];

const single = (country: string, biddingZone: string): Zone => ({
  id: country,
  country,
  biddingZone,
  region: '',
});
const split = (id: string, country: string, biddingZone: string, region: string): Zone => ({
  id,
  country,
  biddingZone,
  region,
});

export const ZONES: readonly Zone[] = [
  single('pl', 'PL'),
  single('at', 'AT'),
  single('be', 'BE'),
  single('bg', 'BG'),
  single('hr', 'HR'),
  single('cz', 'CZ'),
  split('dk1', 'dk', 'DK1', 'DK1 — Jutlandia i Fionia'),
  split('dk2', 'dk', 'DK2', 'DK2 — Zelandia i Kopenhaga'),
  single('ee', 'EE'),
  single('fi', 'FI'),
  single('fr', 'FR'),
  single('gr', 'GR'),
  single('es', 'ES'),
  single('nl', 'NL'),
  single('ie', 'IE(SEM)'),
  single('lt', 'LT'),
  single('lv', 'LV'),
  single('de', 'DE-LU'),
  split('no1', 'no', 'NO1', 'NO1 — Oslo'),
  split('no2', 'no', 'NO2', 'NO2 — Kristiansand'),
  split('no3', 'no', 'NO3', 'NO3 — Trondheim'),
  split('no4', 'no', 'NO4', 'NO4 — Tromsø'),
  split('no5', 'no', 'NO5', 'NO5 — Bergen'),
  single('pt', 'PT'),
  single('ro', 'RO'),
  single('rs', 'RS'),
  single('sk', 'SK'),
  single('si', 'SI'),
  single('ch', 'CH'),
  split('se1', 'se', 'SE1', 'SE1 — Luleå'),
  split('se2', 'se', 'SE2', 'SE2 — Sundsvall'),
  split('se3', 'se', 'SE3', 'SE3 — Sztokholm'),
  split('se4', 'se', 'SE4', 'SE4 — Malmö'),
  single('hu', 'HU'),
  split('it-north', 'it', 'IT-North', 'Północ'),
  split('it-centre-north', 'it', 'IT-Centre-North', 'Centrum-Północ'),
  split('it-centre-south', 'it', 'IT-Centre-South', 'Centrum-Południe'),
  split('it-south', 'it', 'IT-South', 'Południe'),
  split('it-calabria', 'it', 'IT-Calabria', 'Kalabria'),
  split('it-sicily', 'it', 'IT-Sicily', 'Sycylia'),
  split('it-sardinia', 'it', 'IT-Sardinia', 'Sardynia'),
];

export const DEFAULT_ZONE = 'pl';

export function findZone(id: string): Zone | undefined {
  return ZONES.find((z) => z.id === id);
}

export function zoneById(id: string): Zone {
  const z = findZone(id);
  if (!z) throw new Error(`Unknown zone: ${id}`);
  return z;
}

export function countryByCode(code: string): Country {
  const found = COUNTRIES.find((x) => x.code === code);
  if (!found) throw new Error(`Unknown country: ${code}`);
  return found;
}

export function zonesOfCountry(code: string): Zone[] {
  return ZONES.filter((z) => z.country === code);
}

/** "Szwecja — SE3 — Sztokholm" or just "Polska". */
export function zoneName(z: Zone): string {
  const country = countryByCode(z.country).name;
  return z.region ? `${country} · ${z.region}` : country;
}

/** Emoji flag from a two-letter country code (regional indicator symbols). */
export function flagEmoji(countryCode: string): string {
  return countryCode
    .toUpperCase()
    .split('')
    .map((ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65))
    .join('');
}
