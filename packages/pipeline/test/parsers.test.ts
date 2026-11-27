import { describe, expect, it } from 'vitest';
import co2 from './fixtures/ec-co2eq-pl.json';
import price from './fixtures/ec-price-pl.json';
import power from './fixtures/ec-public-power-pl.json';
import rce from './fixtures/pse-rce-pln.json';
import { parseCo2, parsePrice, parsePublicPower } from '../src/sources/energyCharts';
import { parseRce } from '../src/sources/pse';
import { addDays, localDate } from '@energy/core';

describe('Energy-Charts parsers (real API fixtures)', () => {
  it('parses public_power into UTC mix points', () => {
    const mix = parsePublicPower(power as never);
    expect(mix).toHaveLength(8);
    const first = mix[0]!;
    expect(first.t).toBe('2026-11-26T23:00:00.000Z');
    expect(first.mw.coal).toBeGreaterThan(10_000);
    expect(first.co2).toBeGreaterThan(600);
    expect(first.co2).toBeLessThan(1000);
    expect(first.renewableShare).toBeGreaterThan(0);
    expect(first.renewableShare).toBeLessThan(100);
  });

  it('parses day-ahead prices', () => {
    const pts = parsePrice(price as never);
    expect(pts[0]).toEqual({ t: '2026-11-27T23:00:00.000Z', v: 232.54 });
  });

  it('splits co2eq into measured values and the remaining forecast', () => {
    const { measured, forecast } = parseCo2(co2 as never);
    expect(measured.length).toBeGreaterThan(0);
    expect(forecast.length).toBeGreaterThan(0);
    expect(measured.at(-1)!.t < forecast[0]!.t).toBe(true);
    for (const pt of [...measured, ...forecast]) expect(Number.isInteger(pt.v)).toBe(true);
  });
});

describe('PSE RCE parser (real API fixture)', () => {
  it('converts interval end (dtime_utc) to interval start', () => {
    const pts = parseRce(rce.value as never);
    expect(pts[0]).toEqual({ t: '2026-11-27T23:00:00.000Z', v: 1019.55 });
    expect(Date.parse(pts[1]!.t) - Date.parse(pts[0]!.t)).toBe(15 * 60_000);
  });

  it('handles the midnight-crossing period', () => {
    const pts = parseRce([{ rce_pln: 1, dtime_utc: '2026-11-28 00:00:00', period_utc: '23:45 - 00:00' }]);
    expect(pts[0]!.t).toBe('2026-11-27T23:45:00.000Z');
  });
});

describe('dates', () => {
  it('uses the local calendar date, not UTC', () => {
    // 23:30 UTC on 27 Nov is already 28 Nov in Warsaw
    expect(localDate(new Date('2026-11-27T23:30:00Z'), 'Europe/Warsaw')).toBe('2026-11-28');
  });
  it('adds days across month ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  });
});
