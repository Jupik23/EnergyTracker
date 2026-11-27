/**
 * Fuel taxonomy and emission factors.
 *
 * Upstream sources (Energy-Charts, PSE, ENTSO-E) use many fine-grained
 * production types. We keep the raw detail for CO₂ maths and fold it into
 * eight display categories for charts (more than eight colours stops being
 * readable, see docs/ARCHITECTURE.md).
 */

export const FUEL_CATEGORIES = [
  'coal',
  'nuclear',
  'gas',
  'hydro',
  'solar',
  'wind',
  'biomass',
  'other',
] as const;

export type FuelCategory = (typeof FUEL_CATEGORIES)[number];

export const FUEL_LABELS_PL: Record<FuelCategory, string> = {
  coal: 'Węgiel',
  nuclear: 'Atom',
  gas: 'Gaz',
  hydro: 'Woda',
  solar: 'Słońce',
  wind: 'Wiatr',
  biomass: 'Biomasa',
  other: 'Inne',
};

export const RENEWABLE_CATEGORIES: ReadonlySet<FuelCategory> = new Set(['hydro', 'solar', 'wind', 'biomass']);

interface FuelDef {
  category: FuelCategory;
  /** Life-cycle emission factor, g CO₂-eq per kWh produced. */
  gCo2PerKwh: number;
}

/**
 * Life-cycle emission factors (g CO₂-eq / kWh).
 * Main source: IPCC AR5 WG3 Annex III (2014), median values.
 * Lignite uses a higher value than hard coal, in line with UBA (Germany) and
 * Electricity Maps defaults, because IPCC reports a single "coal" figure.
 */
export const FUELS: Record<string, FuelDef> = {
  fossil_brown_coal_lignite: { category: 'coal', gCo2PerKwh: 1100 },
  fossil_hard_coal: { category: 'coal', gCo2PerKwh: 820 },
  fossil_coal_derived_gas: { category: 'coal', gCo2PerKwh: 820 },
  fossil_gas: { category: 'gas', gCo2PerKwh: 490 },
  fossil_oil: { category: 'other', gCo2PerKwh: 650 },
  nuclear: { category: 'nuclear', gCo2PerKwh: 12 },
  hydro_run_of_river: { category: 'hydro', gCo2PerKwh: 24 },
  hydro_water_reservoir: { category: 'hydro', gCo2PerKwh: 24 },
  wind_onshore: { category: 'wind', gCo2PerKwh: 11 },
  wind_offshore: { category: 'wind', gCo2PerKwh: 12 },
  solar: { category: 'solar', gCo2PerKwh: 41 },
  biomass: { category: 'biomass', gCo2PerKwh: 230 },
  geothermal: { category: 'other', gCo2PerKwh: 38 },
  other_renewables: { category: 'other', gCo2PerKwh: 38 },
  waste: { category: 'other', gCo2PerKwh: 700 },
  others: { category: 'other', gCo2PerKwh: 700 },
};

/**
 * Series that are not net generation: storage (charging and discharging),
 * imports/exports, load and derived ratios. They are excluded from the
 * production mix, so intensity is "production-based" (imports ignored).
 */
const NON_GENERATION = [
  /consumption$/,
  /^hydro_pumped_storage$/,
  /^battery$/,
  /^cross_border/,
  /^load$/,
  /^residual_load$/,
  /share/,
];

export function isGenerationSeries(id: string): boolean {
  return !NON_GENERATION.some((re) => re.test(id));
}

/** Unknown generation series fall back to "other" with a conservative factor. */
export function fuelDef(id: string): FuelDef {
  return FUELS[id] ?? { category: 'other', gCo2PerKwh: 700 };
}
