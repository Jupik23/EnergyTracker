import { describe, expect, it } from 'vitest';
import {
  DSOS,
  LEVIES,
  VAT,
  costOf,
  dsoById,
  easterSunday,
  isHoliday,
  shiftUsage,
  syntheticProfile,
  tariffOptions,
  zoneAt,
  type HourUse,
} from '../src';

const H = 3_600_000;
/** Instant for a wall-clock time in Poland, given the UTC offset in force. */
const pl = (iso: string, offsetHours: 1 | 2) => Date.parse(`${iso}:00Z`) - offsetHours * H;

describe('holidays', () => {
  it('computes Easter and Polish movable feasts', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    expect(isHoliday('pl', '2026-04-06')).toBe(true); // Easter Monday
    expect(isHoliday('pl', '2026-06-04')).toBe(true); // Corpus Christi (Easter + 60)
    expect(isHoliday('pl', '2026-12-24')).toBe(true); // Christmas Eve since 2025
    expect(isHoliday('pl', '2024-12-24')).toBe(false);
    expect(isHoliday('pl', '2026-11-27')).toBe(false);
  });
});

describe('zoneAt', () => {
  const tauron = dsoById('tauron');
  const g12 = tauron.tariffs.find((t) => t.group === 'G12')!;
  const g12w = tauron.tariffs.find((t) => t.group === 'G12w')!;
  const g13 = tauron.tariffs.find((t) => t.group === 'G13')!;

  it('uses meter (winter) time, so summer zones shift an hour on the wall clock', () => {
    // Winter: 13:00 wall clock = 13:00 meter time → cheap.
    expect(zoneAt(g12.rules, pl('2026-01-14T13:00', 1))).toBe('night');
    expect(zoneAt(g12.rules, pl('2026-01-14T15:00', 1))).toBe('day');
    // Summer: 13:00 wall clock = 12:00 meter time → still day; 15:00 wall = 14:00 meter → cheap.
    expect(zoneAt(g12.rules, pl('2026-07-14T13:00', 2))).toBe('day');
    expect(zoneAt(g12.rules, pl('2026-07-14T15:00', 2))).toBe('night');
  });

  it('wraps the night zone past midnight', () => {
    expect(zoneAt(g12.rules, pl('2026-01-14T23:00', 1))).toBe('night');
    expect(zoneAt(g12.rules, pl('2026-01-15T05:00', 1))).toBe('night');
    expect(zoneAt(g12.rules, pl('2026-01-15T06:00', 1))).toBe('day');
  });

  it('makes weekends and holidays off-peak in G12w', () => {
    expect(zoneAt(g12w.rules, pl('2026-11-28T18:00', 1))).toBe('offpeak'); // Saturday
    expect(zoneAt(g12w.rules, pl('2026-11-11T18:00', 1))).toBe('offpeak'); // Independence Day (Wed)
    expect(zoneAt(g12w.rules, pl('2026-11-12T18:00', 1))).toBe('peak');
  });

  it('applies seasonal afternoon peaks in G13', () => {
    expect(zoneAt(g13.rules, pl('2026-01-14T17:00', 1))).toBe('afternoon');
    expect(zoneAt(g13.rules, pl('2026-07-14T17:00', 2))).toBe('other'); // 16:00 meter time, summer peak is 19–22
    expect(zoneAt(g13.rules, pl('2026-07-14T21:00', 2))).toBe('afternoon');
  });

  it('covers every hour of a year for every tariff', () => {
    const start = Date.parse('2026-01-01T00:00:00Z');
    for (const dso of DSOS) {
      for (const t of dso.tariffs) {
        for (let ms = start; ms < start + 365 * 24 * H; ms += 7 * H) {
          const z = zoneAt(t.rules, ms);
          expect(t.zones[z], `${dso.id} ${t.group} ${z}`).toBeDefined();
        }
      }
    }
  });
});

describe('costOf', () => {
  const tauron = dsoById('tauron');
  const [g11] = tariffOptions(tauron);

  it('prices G11 by hand', () => {
    // 100 kWh over one January day (one month on the bill).
    const usage: HourUse[] = Array.from({ length: 24 }, (_, i) => ({
      t: Date.parse('2026-01-14T00:00:00Z') + i * H,
      kwh: 100 / 24,
    }));
    const c = costOf(g11!, usage, { phases: 1 });
    const perKwh = 0.497 + LEVIES.excise + 0.2464 + 0.0331 + LEVIES.oze + LEVIES.cogeneration;
    // Annualised 1200 kWh → capacity bracket 500–1200 kWh.
    const fixed = 7.38 + 4.56 + 10.31;
    expect(c.months).toBe(1);
    expect(c.net).toBeCloseTo(100 * perKwh + fixed, 6);
    expect(c.total).toBeCloseTo((100 * perKwh + fixed) * (1 + VAT), 6);
  });

  it('prices dynamic energy from the market and fills missing hours with the average', () => {
    const opts = tariffOptions(tauron, { marginPerKwh: 0.05, monthlyFee: 0 });
    const dyn = opts.find((o) => o.id === 'tauron:G11:dynamic')!;
    const t0 = Date.parse('2026-01-14T00:00:00Z');
    const usage: HourUse[] = [
      { t: t0, kwh: 1 },
      { t: t0 + H, kwh: 1 },
    ];
    const c = costOf(dyn, usage, { phases: 1, marketPrice: (ms) => (ms === t0 ? 0.3 : undefined) });
    expect(c.missingPriceHours).toBe(1);
    expect(c.energy).toBeCloseTo(2 * (0.3 + 0.05 + LEVIES.excise), 6);
  });

  it('rewards shifting load into cheap zones', () => {
    const from = Date.parse('2026-01-01T00:00:00Z');
    const usage = syntheticProfile('household', 3000, from, from + 365 * 24 * H);
    const g12 = tariffOptions(tauron).find((o) => o.tariff.group === 'G12')!;
    const price = (ms: number) => g12.tariff.zones[zoneAt(g12.tariff.rules, ms)]!.rate;
    const shifted = shiftUsage(usage, 0.3, price);
    const sum = (u: HourUse[]) => u.reduce((s, x) => s + x.kwh, 0);
    expect(sum(shifted)).toBeCloseTo(sum(usage), 6);
    expect(costOf(g12, shifted, { phases: 1 }).total).toBeLessThan(costOf(g12, usage, { phases: 1 }).total);
  });
});

describe('syntheticProfile', () => {
  it('sums to the requested annual consumption and peaks in the evening', () => {
    const from = Date.parse('2026-01-01T00:00:00Z');
    const p = syntheticProfile('household', 2000, from, from + 365 * 24 * H);
    expect(p.reduce((s, x) => s + x.kwh, 0)).toBeCloseTo(2000 * (365 / 365.25), 3);
    const at = (iso: string) => p.find((x) => x.t === pl(iso, 1))!.kwh;
    expect(at('2026-01-14T19:00')).toBeGreaterThan(at('2026-01-14T03:00') * 3);
  });
});
