/**
 * Polish household electricity tariffs (2026) and a cost engine that prices
 * an hourly consumption profile under each of them.
 *
 * A household bill has two independent parts:
 *  - distribution, set by the grid operator (OSD) for the tariff group: a
 *    variable rate per time zone, a fixed monthly rate, and per-kWh levies;
 *  - energy, from the seller: either the seller's regulated price per zone,
 *    or a dynamic price that follows the day-ahead market (RCE) plus a margin.
 * Dynamic energy can be combined with any distribution group, so the
 * comparison lists e.g. "dynamiczna + G12" as its own option.
 *
 * All rates are net (without VAT), in zł/kWh or zł/month. Sources: tariff
 * extracts of each OSD for 2026 approved by the URE President on 17.12.2025
 * (Stoen: tariff of 25.02.2026), sellers' URE-approved tariffs for 2026.
 * PGE Dystrybucja rates come from a secondary source (the operator's PDF
 * could not be fetched) and are marked `verified: false`.
 */
import { isHoliday } from './holidays';

/** Zone key within a tariff group: "all", "day", "night", "peak", "offpeak", … */
export type ZoneKey = string;

export interface ZoneRule {
  /** Months 1..12 the rule applies to; all year when omitted. */
  months?: number[];
  /** "work" = Mon–Fri except public holidays, "off" = Sat, Sun and holidays; every day when omitted. */
  days?: 'work' | 'off';
  /**
   * Hour ranges [from, to) in meter time. Meters keep winter time (CET) all
   * year, as every OSD tariff states, so in summer zones fall an hour later on
   * the wall clock. `to` < `from` wraps past midnight. All day when omitted.
   */
  hours?: [number, number][];
  zone: ZoneKey;
}

export interface DsoTariff {
  /** Tariff group symbol, e.g. "G12w". */
  group: string;
  /** Short description for the UI. */
  description: string;
  /** First matching rule wins; the last rule should match everything. */
  rules: ZoneRule[];
  /** Variable distribution rate per zone, zł/kWh net, with a display label. */
  zones: Record<ZoneKey, { label: string; rate: number }>;
  /** Fixed network rate, zł/month net, by number of phases. */
  fixed: { 1: number; 3: number };
}

export interface Dso {
  id: string;
  name: string;
  /** Where the operator works, for the picker. */
  area: string;
  defaultSeller: string;
  /** Stawka jakościowa, zł/kWh net (from 1.02.2026). */
  quality: number;
  /** Opłata abonamentowa for monthly billing, zł/month net. */
  subscription: number;
  tariffs: DsoTariff[];
  source: { name: string; url: string };
  /** False when rates come from a secondary source rather than the operator's tariff. */
  verified: boolean;
}

export interface Seller {
  id: string;
  name: string;
  /** Opłata handlowa, zł/month net. */
  monthlyFee: number;
  /** Energy price per group and zone, zł/kWh net without excise. */
  prices: Record<string, Record<ZoneKey, number>>;
  verified: boolean;
}

/** Levies charged per kWh by every operator (zł/kWh net). */
export const LEVIES = {
  /** Opłata OZE, 7,30 zł/MWh. */
  oze: 0.0073,
  /** Opłata kogeneracyjna, 3,00 zł/MWh. */
  cogeneration: 0.003,
  /** Akcyza, 5 zł/MWh, part of the energy price. */
  excise: 0.005,
} as const;

export const VAT = 0.23;

/** Opłata mocowa for households (zł/month net) by annual consumption. */
export function capacityFee(annualKwh: number): number {
  if (annualKwh < 500) return 4.29;
  if (annualKwh <= 1200) return 10.31;
  if (annualKwh <= 2800) return 17.18;
  return 24.05;
}

// ── Zone schedules ───────────────────────────────────────────────────────────

const SUMMER = [4, 5, 6, 7, 8, 9];
const WINTER = [1, 2, 3, 10, 11, 12];

/** Classic G12: cheap 13–15 and 22–6 every day. */
const G12_RULES: ZoneRule[] = [
  {
    hours: [
      [13, 15],
      [22, 6],
    ],
    zone: 'night',
  },
  { zone: 'day' },
];

/** G12w: as G12 on working days, cheap all day on weekends and holidays. */
const G12W_RULES: ZoneRule[] = [
  { days: 'off', zone: 'offpeak' },
  {
    hours: [
      [13, 15],
      [22, 6],
    ],
    zone: 'offpeak',
  },
  { zone: 'peak' },
];

/** "Eco" groups (Enea G12sezON, Stoen G12eko): cheap at night in winter, at midday in summer. */
const ECO_RULES: ZoneRule[] = [
  {
    months: WINTER,
    hours: [
      [22, 6],
      [11, 13],
    ],
    zone: 'recommended',
  },
  {
    months: SUMMER,
    hours: [
      [4, 6],
      [9, 17],
    ],
    zone: 'recommended',
  },
  { zone: 'other' },
];

const day = (rate: number) => ({ label: 'Dzień', rate });
const night = (rate: number) => ({ label: 'Noc', rate });
const peak = (rate: number) => ({ label: 'Szczyt', rate });
const offpeak = (rate: number) => ({ label: 'Poza szczytem', rate });
const all = (rate: number) => ({ label: 'Cała doba', rate });
const ALL_DAY: ZoneRule[] = [{ zone: 'all' }];

/** Enea G13active: zones change every month (Wyciąg z Taryfy Enea Operator 2026, pkt 2.2.11). */
const G13ACTIVE_MONTHS: [restrict: [number, number][], recommended: [number, number][]][] = [
  [
    [
      [7, 10],
      [15, 20],
    ],
    [[23, 6]],
  ], // styczeń
  [
    [
      [7, 9],
      [16, 21],
    ],
    [[23, 6]],
  ],
  [
    [
      [6, 9],
      [16, 23],
    ],
    [[10, 16]],
  ],
  [
    [
      [6, 9],
      [18, 23],
    ],
    [[10, 16]],
  ],
  [
    [
      [6, 9],
      [18, 23],
    ],
    [[9, 17]],
  ],
  [
    [
      [6, 9],
      [18, 23],
    ],
    [[9, 17]],
  ],
  [
    [
      [6, 9],
      [18, 23],
    ],
    [[9, 17]],
  ],
  [
    [
      [6, 9],
      [18, 23],
    ],
    [[9, 17]],
  ],
  [
    [
      [6, 9],
      [17, 23],
    ],
    [[10, 16]],
  ],
  [
    [
      [7, 9],
      [16, 23],
    ],
    [[10, 16]],
  ],
  [
    [
      [7, 9],
      [14, 21],
    ],
    [[23, 6]],
  ],
  [
    [
      [7, 10],
      [13, 20],
    ],
    [[23, 6]],
  ], // grudzień
];

// ── Operators ────────────────────────────────────────────────────────────────

export const DSOS: readonly Dso[] = [
  {
    id: 'pge',
    name: 'PGE Dystrybucja',
    area: 'wschodnia i centralna Polska (Lublin, Białystok, Łódź, Rzeszów, Skarżysko, Warszawa-okolice, Zamość)',
    defaultSeller: 'pge',
    quality: 0.0332,
    subscription: 4.5,
    verified: false,
    source: { name: 'Taryfa PGE Dystrybucja 2026 (za energycompass.pl)', url: 'https://pgedystrybucja.pl' },
    tariffs: [
      {
        group: 'G11',
        description: 'Jedna cena przez całą dobę',
        rules: ALL_DAY,
        zones: { all: all(0.3469) },
        fixed: { 1: 5.5, 3: 9.98 },
      },
      {
        group: 'G12',
        description: 'Tańsze 22–6 i po południu (zimą 13–15, latem 15–17)',
        rules: [
          {
            months: WINTER,
            hours: [
              [13, 15],
              [22, 6],
            ],
            zone: 'night',
          },
          {
            months: SUMMER,
            hours: [
              [15, 17],
              [22, 6],
            ],
            zone: 'night',
          },
          { zone: 'day' },
        ],
        zones: { day: day(0.4014), night: night(0.0765) },
        fixed: { 1: 8.5, 3: 14.4 },
      },
      {
        group: 'G12w',
        description: 'Jak G12, a do tego całe weekendy i święta taniej',
        rules: [
          { days: 'off', zone: 'offpeak' },
          {
            months: WINTER,
            hours: [
              [13, 15],
              [22, 6],
            ],
            zone: 'offpeak',
          },
          {
            months: SUMMER,
            hours: [
              [15, 17],
              [22, 6],
            ],
            zone: 'offpeak',
          },
          { zone: 'peak' },
        ],
        zones: { peak: peak(0.4276), offpeak: offpeak(0.0845) },
        fixed: { 1: 9.15, 3: 14.98 },
      },
    ],
  },
  {
    id: 'tauron',
    name: 'TAURON Dystrybucja',
    area: 'południowa Polska (Śląsk, Małopolska, Opolszczyzna, Dolny Śląsk)',
    defaultSeller: 'tauron',
    quality: 0.0331,
    subscription: 4.56,
    verified: true,
    source: {
      name: 'Wyciąg z Taryfy TAURON Dystrybucja 2026 (DRE.WRE.4211.54.8.2025.ASa1)',
      url: 'https://www.tauron-dystrybucja.pl/uslugi-dystrybucyjne/taryfa',
    },
    tariffs: [
      {
        group: 'G11',
        description: 'Jedna cena przez całą dobę',
        rules: ALL_DAY,
        zones: { all: all(0.2464) },
        fixed: { 1: 7.38, 3: 10.86 },
      },
      {
        group: 'G12',
        description: 'Tańsze 13–15 i 22–6',
        rules: G12_RULES,
        zones: { day: day(0.2841), night: night(0.0558) },
        fixed: { 1: 7.38, 3: 10.86 },
      },
      {
        group: 'G12w',
        description: 'Jak G12, a do tego całe weekendy i święta taniej',
        rules: G12W_RULES,
        zones: { peak: peak(0.3298), offpeak: offpeak(0.0512) },
        fixed: { 1: 7.38, 3: 10.86 },
      },
      {
        group: 'G13',
        description: 'Trzy strefy: drogi szczyt popołudniowy, tanio noc, weekend i środek dnia',
        rules: [
          { days: 'off', zone: 'other' },
          { hours: [[7, 13]], zone: 'morning' },
          { months: SUMMER, hours: [[19, 22]], zone: 'afternoon' },
          { months: WINTER, hours: [[16, 21]], zone: 'afternoon' },
          { zone: 'other' },
        ],
        zones: {
          morning: { label: 'Szczyt przedpołudniowy', rate: 0.2203 },
          afternoon: { label: 'Szczyt popołudniowy', rate: 0.3898 },
          other: { label: 'Pozostałe godziny', rate: 0.0392 },
        },
        fixed: { 1: 7.38, 3: 10.86 },
      },
      {
        group: 'G13s',
        description: 'Sezonowa: bardzo tanio w środku dnia latem i w weekendy',
        rules: [
          { hours: [[21, 7]], zone: 'night' },
          { months: SUMMER, days: 'work', hours: [[9, 17]], zone: 'sw_mid' },
          { months: SUMMER, days: 'off', hours: [[9, 17]], zone: 'so_mid' },
          { months: SUMMER, days: 'work', zone: 'sw_peak' },
          { months: SUMMER, days: 'off', zone: 'so_peak' },
          { months: WINTER, days: 'work', hours: [[10, 15]], zone: 'ww_mid' },
          { months: WINTER, days: 'off', hours: [[10, 15]], zone: 'wo_mid' },
          { months: WINTER, days: 'work', zone: 'ww_peak' },
          { zone: 'wo_peak' },
        ],
        zones: {
          night: { label: 'Noc', rate: 0.1094 },
          sw_mid: { label: 'Lato, dzień roboczy, środek dnia', rate: 0.1 },
          sw_peak: { label: 'Lato, dzień roboczy, szczyt', rate: 0.2842 },
          so_mid: { label: 'Lato, dzień wolny, środek dnia', rate: 0.04 },
          so_peak: { label: 'Lato, dzień wolny, szczyt', rate: 0.1176 },
          ww_mid: { label: 'Zima, dzień roboczy, środek dnia', rate: 0.1999 },
          ww_peak: { label: 'Zima, dzień roboczy, szczyt', rate: 0.3332 },
          wo_mid: { label: 'Zima, dzień wolny, środek dnia', rate: 0.12 },
          wo_peak: { label: 'Zima, dzień wolny, szczyt', rate: 0.196 },
        },
        fixed: { 1: 7.38, 3: 10.86 },
      },
    ],
  },
  {
    id: 'enea',
    name: 'Enea Operator',
    area: 'zachodnia i północno-zachodnia Polska (Wielkopolska, Lubuskie, Zachodniopomorskie, Kujawy)',
    defaultSeller: 'enea',
    quality: 0.0331,
    subscription: 3.84,
    verified: true,
    source: {
      name: 'Wyciąg z Taryfy Enea Operator 2026 (DRE.WRE.4211.52.11.2025.TG)',
      url: 'https://www.operator.enea.pl/uslugi-dystrybucyjne/taryfa',
    },
    tariffs: [
      {
        group: 'G11',
        description: 'Jedna cena przez całą dobę',
        rules: ALL_DAY,
        zones: { all: all(0.2456) },
        fixed: { 1: 7.45, 3: 10.41 },
      },
      {
        group: 'G12',
        // The tariff only fixes "8 h between 22 and 7 plus 2 h between 13 and 17"; 13–15/22–6 is the usual setting.
        description: 'Tańsze 10 godzin: zwykle 13–15 i 22–6 (dokładne godziny ustala operator)',
        rules: G12_RULES,
        zones: { day: day(0.2779), night: night(0.0913) },
        fixed: { 1: 9.59, 3: 14.56 },
      },
      {
        group: 'G12w',
        description: 'Tańsze 21–6 w dni robocze i całe weekendy',
        rules: [{ days: 'off', zone: 'offpeak' }, { hours: [[21, 6]], zone: 'offpeak' }, { zone: 'peak' }],
        zones: { peak: peak(0.2702), offpeak: offpeak(0.0813) },
        fixed: { 1: 16.85, 3: 26.23 },
      },
      {
        group: 'G12sezON',
        description: 'Zimą tanio w nocy i 11–13, latem 4–6 i 9–17 — pod fotowoltaikę',
        rules: ECO_RULES,
        zones: {
          recommended: { label: 'Zalecany pobór', rate: 0.0913 },
          other: { label: 'Pozostałe', rate: 0.2779 },
        },
        fixed: { 1: 9.59, 3: 14.56 },
      },
      {
        group: 'G13active',
        description: 'Strefy zmieniane co miesiąc: drogo w szczytach, tanio gdy jest dużo OZE',
        rules: [
          ...G13ACTIVE_MONTHS.flatMap(([restrict, recommended], i): ZoneRule[] => [
            { months: [i + 1], hours: restrict, zone: 'restrict' },
            { months: [i + 1], hours: recommended, zone: 'recommended' },
          ]),
          { zone: 'other' },
        ],
        zones: {
          restrict: { label: 'Zalecane ograniczanie', rate: 0.3032 },
          other: { label: 'Pozostałe', rate: 0.2456 },
          recommended: { label: 'Zalecany pobór', rate: 0.073 },
        },
        fixed: { 1: 9.59, 3: 14.56 },
      },
    ],
  },
  {
    id: 'energa',
    name: 'Energa-Operator',
    area: 'północna i centralna Polska (Pomorze, Warmia i Mazury, Kujawy, Płock, Kalisz)',
    defaultSeller: 'energa',
    quality: 0.0332,
    subscription: 4.64,
    verified: true,
    source: { name: 'Wyciąg z Taryfy Energa-Operator 2026', url: 'https://energa-operator.pl/uslugi/taryfa' },
    tariffs: [
      {
        group: 'G11',
        description: 'Jedna cena przez całą dobę',
        rules: ALL_DAY,
        zones: { all: all(0.3485) },
        fixed: { 1: 7.83, 3: 11.77 },
      },
      {
        group: 'G12',
        description: 'Tańsze 13–15 i 22–6',
        rules: G12_RULES,
        zones: { day: day(0.3844), night: night(0.0827) },
        fixed: { 1: 14.35, 3: 20.17 },
      },
      {
        group: 'G12w',
        description: 'Jak G12, a do tego całe weekendy i święta taniej',
        rules: G12W_RULES,
        zones: { peak: peak(0.4017), offpeak: offpeak(0.0851) },
        fixed: { 1: 14.35, 3: 20.17 },
      },
    ],
  },
  {
    id: 'stoen',
    name: 'Stoen Operator',
    area: 'Warszawa',
    defaultSeller: 'eon',
    quality: 0.0332,
    subscription: 2.88,
    verified: true,
    source: { name: 'Taryfa Stoen Operator 2026 (25.02.2026), pkt 7.5', url: 'https://www.stoen.pl' },
    tariffs: [
      {
        group: 'G11',
        description: 'Jedna cena przez całą dobę',
        rules: ALL_DAY,
        zones: { all: all(0.2342) },
        fixed: { 1: 11.46, 3: 18.53 },
      },
      {
        group: 'G12',
        description: 'Tańsze 13–15 i 22–6',
        rules: G12_RULES,
        zones: { day: day(0.2545), night: night(0.0555) },
        fixed: { 1: 11.46, 3: 18.53 },
      },
      {
        group: 'G12w',
        description: 'Tańsze 22–6 w dni robocze i całe weekendy',
        rules: [{ days: 'off', zone: 'offpeak' }, { hours: [[22, 6]], zone: 'offpeak' }, { zone: 'peak' }],
        zones: { peak: peak(0.257), offpeak: offpeak(0.1079) },
        fixed: { 1: 11.46, 3: 18.53 },
      },
      {
        group: 'G12eko',
        description: 'Zimą tanio w nocy i 11–13, latem 4–6 i 9–17 — pod fotowoltaikę',
        rules: ECO_RULES,
        zones: {
          recommended: { label: 'Zalecany pobór', rate: 0.1639 },
          other: { label: 'Pozostałe', rate: 0.2827 },
        },
        fixed: { 1: 11.46, 3: 18.53 },
      },
    ],
  },
];

/**
 * Default sellers' energy prices for 2026 (net, without excise). Groups a
 * seller has no separate price for fall back to its G11 price.
 */
export const SELLERS: readonly Seller[] = [
  {
    id: 'pge',
    name: 'PGE Obrót',
    monthlyFee: 0,
    verified: true,
    prices: {
      G11: { all: 0.4982 },
      G12: { day: 0.5656, night: 0.3718 },
      G12w: { peak: 0.5821, offpeak: 0.4235 },
    },
  },
  {
    id: 'tauron',
    name: 'Tauron Sprzedaż',
    monthlyFee: 0,
    verified: true,
    prices: {
      G11: { all: 0.497 },
      G12: { day: 0.543, night: 0.413 },
      G12w: { peak: 0.622, offpeak: 0.413 },
      G13: { morning: 0.4668, afternoon: 0.778, other: 0.421 },
    },
  },
  {
    id: 'enea',
    name: 'Enea',
    monthlyFee: 0,
    verified: true,
    prices: {
      G11: { all: 0.498 },
      G12: { day: 0.5779, night: 0.3369 },
      G12w: { peak: 0.6518, offpeak: 0.3465 },
    },
  },
  {
    id: 'energa',
    name: 'Energa Obrót',
    monthlyFee: 0,
    verified: true,
    prices: {
      G11: { all: 0.4968 },
      G12: { day: 0.5789, night: 0.3753 },
      G12w: { peak: 0.6057, offpeak: 0.394 },
    },
  },
  {
    id: 'eon',
    name: 'E.ON Polska',
    // E.ON's household prices are not approved by URE; derived from its published gross prices.
    monthlyFee: 13.23,
    verified: false,
    prices: {
      G11: { all: 0.5 },
      G12: { day: 0.5344, night: 0.4245 },
      G12w: { peak: 0.5244, offpeak: 0.4395 },
    },
  },
];

export function dsoById(id: string): Dso {
  const d = DSOS.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown DSO: ${id}`);
  return d;
}

export function sellerById(id: string): Seller {
  const s = SELLERS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown seller: ${id}`);
  return s;
}

/** Seller's net energy price for a zone of a group (falls back to its G11 price). */
export function sellerPrice(seller: Seller, group: string, zone: ZoneKey): number {
  return seller.prices[group]?.[zone] ?? seller.prices.G11!.all!;
}

// ── Zones in time ────────────────────────────────────────────────────────────

const HOUR = 3_600_000;

/** Calendar parts in meter time (CET, UTC+1 all year). */
export function meterTime(ms: number): { date: string; month: number; hour: number; weekday: number } {
  const d = new Date(ms + HOUR);
  return {
    date: d.toISOString().slice(0, 10),
    month: d.getUTCMonth() + 1,
    hour: d.getUTCHours(),
    weekday: d.getUTCDay(),
  };
}

function inHours(hour: number, ranges: [number, number][]): boolean {
  return ranges.some(([a, b]) => (a < b ? hour >= a && hour < b : hour >= a || hour < b));
}

/** Zone of a tariff group at a given instant. */
export function zoneAt(rules: ZoneRule[], ms: number, country = 'pl'): ZoneKey {
  const t = meterTime(ms);
  const off = t.weekday === 0 || t.weekday === 6 || isHoliday(country, t.date);
  for (const r of rules) {
    if (r.months && !r.months.includes(t.month)) continue;
    if (r.days === 'work' && off) continue;
    if (r.days === 'off' && !off) continue;
    if (r.hours && !inHours(t.hour, r.hours)) continue;
    return r.zone;
  }
  throw new Error('Tariff rules do not cover every hour');
}

// ── Cost engine ──────────────────────────────────────────────────────────────

export type EnergyOffer =
  | { kind: 'regulated'; seller: Seller }
  /** Market price + margin; `marketPrice` returns zł/kWh net for an hour, or undefined if unknown. */
  | { kind: 'dynamic'; marginPerKwh: number; monthlyFee: number };

export interface TariffOption {
  id: string;
  label: string;
  dso: Dso;
  tariff: DsoTariff;
  energy: EnergyOffer;
}

/** Consumption in one hour; `t` is the hour start (UTC ms). */
export interface HourUse {
  t: number;
  kwh: number;
}

export interface CostBreakdown {
  kwh: number;
  months: number;
  /** All amounts net, zł. */
  energy: number;
  distributionVariable: number;
  fixed: number;
  net: number;
  vat: number;
  /** Gross total, zł. */
  total: number;
  /** Average gross price paid per kWh, everything included. */
  perKwh: number;
  byZone: { zone: ZoneKey; label: string; kwh: number }[];
  /** Hours without a market price (dynamic offers only); their energy is priced at the average. */
  missingPriceHours: number;
}

/** Every combination worth comparing for an operator: its groups with the default seller, plus dynamic energy on the simpler groups. */
export function tariffOptions(
  dso: Dso,
  dynamic?: { marginPerKwh: number; monthlyFee: number },
  seller: Seller = sellerById(dso.defaultSeller),
): TariffOption[] {
  const out: TariffOption[] = dso.tariffs.map((tariff) => ({
    id: `${dso.id}:${tariff.group}`,
    label: tariff.group,
    dso,
    tariff,
    energy: { kind: 'regulated', seller },
  }));
  if (dynamic) {
    for (const tariff of dso.tariffs.filter((t) => ['G11', 'G12', 'G12w'].includes(t.group))) {
      out.push({
        id: `${dso.id}:${tariff.group}:dynamic`,
        label: `Dynamiczna + ${tariff.group}`,
        dso,
        tariff,
        energy: { kind: 'dynamic', ...dynamic },
      });
    }
  }
  return out;
}

/** Marginal net price (energy + variable distribution + levies) of one kWh in that hour. */
export function marginalPrice(
  option: TariffOption,
  ms: number,
  marketPrice?: (ms: number) => number | undefined,
): number | undefined {
  const zone = zoneAt(option.tariff.rules, ms);
  const dist = option.tariff.zones[zone]!.rate + option.dso.quality + LEVIES.oze + LEVIES.cogeneration;
  let energy: number | undefined;
  if (option.energy.kind === 'regulated') {
    energy = sellerPrice(option.energy.seller, option.tariff.group, zone);
  } else {
    const m = marketPrice?.(ms);
    energy = m === undefined ? undefined : m + option.energy.marginPerKwh;
  }
  return energy === undefined ? undefined : energy + LEVIES.excise + dist;
}

export function costOf(
  option: TariffOption,
  usage: HourUse[],
  opts: { phases: 1 | 3; marketPrice?: (ms: number) => number | undefined },
): CostBreakdown {
  const { tariff, dso, energy: offer } = option;
  const zoneKwh = new Map<ZoneKey, number>();
  const months = new Set<string>();
  let kwh = 0;
  let energy = 0;
  let distVar = 0;
  let missing = 0;
  let missingKwh = 0;
  let pricedKwh = 0;

  for (const u of usage) {
    const zone = zoneAt(tariff.rules, u.t);
    zoneKwh.set(zone, (zoneKwh.get(zone) ?? 0) + u.kwh);
    months.add(meterTime(u.t).date.slice(0, 7));
    kwh += u.kwh;
    distVar += u.kwh * (tariff.zones[zone]!.rate + dso.quality + LEVIES.oze + LEVIES.cogeneration);
    if (offer.kind === 'regulated') {
      energy += u.kwh * (sellerPrice(offer.seller, tariff.group, zone) + LEVIES.excise);
    } else {
      const m = opts.marketPrice?.(u.t);
      if (m === undefined) {
        missing++;
        missingKwh += u.kwh;
      } else {
        energy += u.kwh * (m + offer.marginPerKwh + LEVIES.excise);
        pricedKwh += u.kwh;
      }
    }
  }
  if (missingKwh > 0 && pricedKwh > 0) energy += (energy / pricedKwh) * missingKwh;

  const nMonths = months.size;
  // Rounded so float noise (24 × 100/24) cannot push a household over a bracket boundary.
  const annualKwh = nMonths > 0 ? Math.round((kwh / nMonths) * 12) : 0;
  const sellerFee = offer.kind === 'regulated' ? offer.seller.monthlyFee : offer.monthlyFee;
  const fixed = nMonths * (tariff.fixed[opts.phases] + dso.subscription + capacityFee(annualKwh) + sellerFee);

  const net = energy + distVar + fixed;
  const vat = net * VAT;
  return {
    kwh,
    months: nMonths,
    energy,
    distributionVariable: distVar,
    fixed,
    net,
    vat,
    total: net + vat,
    perKwh: kwh > 0 ? (net + vat) / kwh : 0,
    byZone: [...zoneKwh.entries()].map(([zone, k]) => ({ zone, label: tariff.zones[zone]!.label, kwh: k })),
    missingPriceHours: missing,
  };
}

/**
 * Moves `share` (0..1) of each day's consumption into that day's cheapest
 * hours for the option — what a household that adapts (washing, dishwasher,
 * EV, boiler on a timer) would do. The moved energy is spread over the
 * `spreadHours` cheapest hours so it stays physically plausible.
 */
export function shiftUsage(
  usage: HourUse[],
  share: number,
  price: (ms: number) => number | undefined,
  spreadHours = 4,
): HourUse[] {
  if (share <= 0) return usage;
  const days = new Map<string, HourUse[]>();
  for (const u of usage) {
    const key = meterTime(u.t).date;
    const list = days.get(key) ?? [];
    list.push(u);
    days.set(key, list);
  }
  const out: HourUse[] = [];
  for (const list of days.values()) {
    const pool = list.reduce((s, u) => s + u.kwh * share, 0);
    const ranked = list
      .map((u) => ({ u, p: price(u.t) }))
      .filter((x): x is { u: HourUse; p: number } => x.p !== undefined)
      .sort((a, b) => a.p - b.p)
      .slice(0, spreadHours)
      .map((x) => x.u.t);
    const targets = new Set(ranked);
    for (const u of list) {
      const extra = targets.has(u.t) && targets.size > 0 ? pool / targets.size : 0;
      out.push({ t: u.t, kwh: u.kwh * (1 - share) + extra });
    }
    if (targets.size === 0) {
      // No prices that day: leave consumption as it was.
      out.splice(out.length - list.length, list.length, ...list);
    }
  }
  return out;
}
