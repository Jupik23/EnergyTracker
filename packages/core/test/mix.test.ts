import { describe, expect, it } from 'vitest';
import { isGenerationSeries, mixShares, toMixPoint } from '../src';

describe('toMixPoint', () => {
  it('folds raw series into categories and computes intensity', () => {
    const p = toMixPoint('2026-11-27T12:00:00Z', {
      fossil_hard_coal: 500,
      fossil_brown_coal_lignite: 500,
      wind_onshore: 1000,
    })!;
    expect(p.mw).toEqual({ coal: 1000, wind: 1000 });
    // (500*820 + 500*1100 + 1000*11) / 2000
    expect(p.co2).toBe(Math.round((500 * 820 + 500 * 1100 + 1000 * 11) / 2000));
    expect(p.renewableShare).toBe(50);
  });

  it('ignores storage, trade, load, ratios, negatives and nulls', () => {
    const p = toMixPoint('t', {
      solar: 100,
      hydro_pumped_storage: 900,
      hydro_pumped_storage_consumption: -500,
      battery: 50,
      cross_border_electricity_trading: 2000,
      load: 19000,
      residual_load: 17000,
      renewable_share_of_load: 15,
      fossil_gas: null,
      biomass: -3,
    })!;
    expect(p.mw).toEqual({ solar: 100 });
    expect(p.co2).toBe(41);
    expect(p.renewableShare).toBe(100);
  });

  it('returns null when nothing was generated (data not yet published)', () => {
    expect(toMixPoint('t', { solar: null, wind_onshore: 0 })).toBeNull();
  });

  it('maps unknown generation series to "other"', () => {
    expect(toMixPoint('t', { tidal_magic: 10 })!.mw).toEqual({ other: 10 });
  });
});

describe('isGenerationSeries', () => {
  it.each([
    ['fossil_hard_coal', true],
    ['nuclear', true],
    ['battery_consumption', false],
    ['renewable_share_of_generation', false],
  ])('%s -> %s', (id, expected) => {
    expect(isGenerationSeries(id)).toBe(expected);
  });
});

describe('mixShares', () => {
  it('returns shares in display order', () => {
    const p = toMixPoint('t', { wind_onshore: 300, fossil_hard_coal: 100 })!;
    expect(mixShares(p).map((s) => [s.category, s.share])).toEqual([
      ['coal', 25],
      ['wind', 75],
    ]);
  });
});
