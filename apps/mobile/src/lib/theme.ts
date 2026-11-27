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
  /** Sequential blue ramp, low → high magnitude (calendar heatmap). */
  seq: ['#cce3fd', '#9dc8f7', '#6aabf1', '#338ced', '#2370cd', '#1757ac', '#0e3d7e'],
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
  // On a dark surface low values recede into the dark, high values get brighter.
  seq: ['#0e3d7e', '#1757ac', '#2370cd', '#338ced', '#6aabf1', '#9dc8f7', '#cce3fd'],
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

/** Near-black or white text, whichever reads better on the given fill. */
export function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.35 ? '#0b0b0b' : '#ffffff';
}
