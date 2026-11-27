import { useColorScheme } from 'react-native';
import type { FuelCategory } from '@energy/core';

/**
 * Colour tokens. Fuel colours are a fixed, validated categorical order
 * (adjacent-pair CVD ΔE ≥ 10 in both modes) — do not reorder or recolour
 * without re-running the palette validator, see docs/ARCHITECTURE.md.
 */
const light = {
  page: '#f9f9f9',
  surface: '#ffffff',
  text: '#191919',
  textMuted: '#666666',
  grid: '#e7e7e7',
  axis: '#c2c2c2',
  border: 'rgba(11,11,11,0.10)',
  accent: '#257de0',
  accentSoft: '#84b9f3',
  deemph: '#c2c2c2',
  successText: '#006c10',
  fuel: {
    coal: '#ec4647',
    nuclear: '#6a4ce2',
    gas: '#f47230',
    hydro: '#00b894',
    solar: '#f2a600',
    wind: '#257de0',
    biomass: '#008a17',
    other: '#ee7fac',
  } satisfies Record<FuelCategory, string>,
  status: { good: '#0aac23', warning: '#fbb315', serious: '#f18a59', critical: '#dc3c3d' },
};

const dark: typeof light = {
  page: '#0b0b0b',
  surface: '#191919',
  text: '#efefef',
  textMuted: '#9c9c9c',
  grid: '#303030',
  axis: '#474747',
  border: 'rgba(255,255,255,0.10)',
  accent: '#338ced',
  accentSoft: '#1757ac',
  deemph: '#474747',
  successText: '#53c556',
  fuel: {
    coal: '#eb6263',
    nuclear: '#9887ef',
    gas: '#e76624',
    hydro: '#00a888',
    solar: '#d28e05',
    wind: '#338ced',
    biomass: '#0aac23',
    other: '#e24d8b',
  },
  status: light.status,
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const FONT = {
  hero: 44,
  title: 20,
  body: 15,
  small: 13,
  tiny: 11,
};
