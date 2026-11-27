/**
 * Per-country forecast set-up: which weather points stand in for the
 * country's wind and solar fleet. Wind points sit where the turbines are
 * (for Poland: the north coast, the offshore area off Łeba and the north-east);
 * solar and temperature points are spread across population centres.
 */

export interface WeatherPoint {
  name: string;
  lat: number;
  lon: number;
}

export interface ForecastConfig {
  country: string;
  /** Energy-Charts bidding zone for training prices. */
  biddingZone: string;
  timezone: string;
  wind: WeatherPoint[];
  /** Solar radiation and temperature. */
  area: WeatherPoint[];
}

export const FORECAST_CONFIGS: readonly ForecastConfig[] = [
  {
    country: 'pl',
    biddingZone: 'PL',
    timezone: 'Europe/Warsaw',
    wind: [
      { name: 'Koszalin', lat: 54.19, lon: 16.17 },
      { name: 'Lębork', lat: 54.55, lon: 17.75 },
      { name: 'Bałtyk (offshore)', lat: 54.95, lon: 17.6 },
      { name: 'Suwałki', lat: 54.1, lon: 22.93 },
      { name: 'Kujawy', lat: 52.65, lon: 18.7 },
    ],
    area: [
      { name: 'Poznań', lat: 52.41, lon: 16.93 },
      { name: 'Warszawa', lat: 52.23, lon: 21.01 },
      { name: 'Wrocław', lat: 51.11, lon: 17.03 },
      { name: 'Kraków', lat: 50.06, lon: 19.94 },
      { name: 'Lublin', lat: 51.25, lon: 22.57 },
    ],
  },
];

export function forecastConfig(country: string): ForecastConfig | undefined {
  return FORECAST_CONFIGS.find((c) => c.country === country);
}

/** Forecast horizon in days after today. Weather forecasts lose most skill beyond a week. */
export const HORIZON_DAYS = 7;
