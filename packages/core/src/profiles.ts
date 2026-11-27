/**
 * Synthetic hourly consumption profiles for households that have no meter
 * data to import. Shapes follow the familiar pattern of Polish G11 load
 * profiles: low at night, a morning bump, a high evening peak, more in winter.
 * They are a reasonable stand-in for comparing tariffs, not a measurement —
 * real data (CSV from the meter) is always better.
 */
import type { HourUse } from './tariffs';

const HOUR = 3_600_000;

export type ProfileKind = 'household' | 'daytime' | 'heatpump' | 'ev';

export interface ProfilePreset {
  kind: ProfileKind;
  label: string;
  description: string;
  annualKwh: number;
}

export const PROFILE_PRESETS: readonly ProfilePreset[] = [
  {
    kind: 'household',
    label: 'Mieszkanie',
    description: 'Typowe zużycie, wieczorny szczyt',
    annualKwh: 2000,
  },
  { kind: 'daytime', label: 'Ktoś w domu w dzień', description: 'Praca zdalna, emeryci', annualKwh: 2800 },
  {
    kind: 'heatpump',
    label: 'Dom z pompą ciepła',
    description: 'Ogrzewanie prądem, dużo zimą',
    annualKwh: 7000,
  },
  {
    kind: 'ev',
    label: 'Dom z autem elektrycznym',
    description: 'Ładowanie po powrocie do domu',
    annualKwh: 5000,
  },
];

/** Relative hourly weights (local time 0..23). */
const SHAPES: Record<'household' | 'daytime', number[]> = {
  household: [
    0.5, 0.4, 0.35, 0.35, 0.35, 0.45, 0.8, 1.1, 1.0, 0.8, 0.75, 0.75, 0.8, 0.8, 0.75, 0.8, 1.0, 1.35, 1.7,
    1.85, 1.8, 1.5, 1.1, 0.75,
  ],
  daytime: [
    0.5, 0.4, 0.35, 0.35, 0.35, 0.45, 0.75, 1.0, 1.1, 1.15, 1.2, 1.25, 1.3, 1.25, 1.15, 1.1, 1.15, 1.35, 1.55,
    1.6, 1.5, 1.3, 1.0, 0.7,
  ],
};

/** Seasonal multiplier for lighting/appliances: ~+25% in January, −20% in July. */
function seasonal(month: number): number {
  return 1 + 0.225 * Math.cos(((month - 1) / 12) * 2 * Math.PI) + 0.025;
}

/** Heating demand weight by month (share of the heating season). */
const HEATING = [0.19, 0.16, 0.13, 0.08, 0.03, 0, 0, 0, 0.02, 0.07, 0.13, 0.19];

const formatters = new Map<string, Intl.DateTimeFormat>();

function localHourMonth(ms: number, timeZone: string): { hour: number; month: number } {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', month: '2-digit', hourCycle: 'h23' });
    formatters.set(timeZone, f);
  }
  const parts = f.formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { hour: get('hour'), month: get('month') };
}

/**
 * Builds an hourly profile for every hour in [fromMs, toMs) that sums to
 * `annualKwh` scaled to the period's length.
 */
export function syntheticProfile(
  kind: ProfileKind,
  annualKwh: number,
  fromMs: number,
  toMs: number,
  timeZone = 'Europe/Warsaw',
): HourUse[] {
  const hours: { t: number; w: number }[] = [];
  const baseShare = kind === 'heatpump' ? 0.4 : kind === 'ev' ? 0.55 : 1;
  for (let t = fromMs; t < toMs; t += HOUR) {
    const { hour, month } = localHourMonth(t, timeZone);
    const shape = SHAPES[kind === 'daytime' ? 'daytime' : 'household'][hour]!;
    let w = baseShare * (shape / 24) * seasonal(month);
    if (kind === 'heatpump') {
      // Space heating runs around the clock, a bit more in the cold early morning.
      w += (0.6 * HEATING[month - 1]! * 12 * (hour >= 4 && hour < 8 ? 1.25 : 1)) / 24;
    }
    if (kind === 'ev') {
      // Plug in after work: 17–23, more on weekdays than at weekends is ignored here.
      w += hour >= 17 && hour < 23 ? 0.45 / 6 : 0;
    }
    hours.push({ t, w });
  }
  const sumW = hours.reduce((s, h) => s + h.w, 0);
  const total = annualKwh * ((toMs - fromMs) / (365.25 * 24 * HOUR));
  return hours.map((h) => ({ t: h.t, kwh: (h.w / sumW) * total }));
}
