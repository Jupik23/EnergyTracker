import type { CountryCode } from './types';

export interface CountryConfig {
  code: CountryCode;
  name: string;
  flag: string;
  /** Energy-Charts bidding zone code for day-ahead prices. */
  biddingZone: string;
  timezone: string;
}

export const COUNTRIES: readonly CountryConfig[] = [
  { code: 'pl', name: 'Polska', flag: '🇵🇱', biddingZone: 'PL', timezone: 'Europe/Warsaw' },
  { code: 'de', name: 'Niemcy', flag: '🇩🇪', biddingZone: 'DE-LU', timezone: 'Europe/Berlin' },
  { code: 'fr', name: 'Francja', flag: '🇫🇷', biddingZone: 'FR', timezone: 'Europe/Paris' },
  { code: 'cz', name: 'Czechy', flag: '🇨🇿', biddingZone: 'CZ', timezone: 'Europe/Prague' },
];

export function countryConfig(code: CountryCode): CountryConfig {
  const c = COUNTRIES.find((x) => x.code === code);
  if (!c) throw new Error(`Unknown country: ${code}`);
  return c;
}
