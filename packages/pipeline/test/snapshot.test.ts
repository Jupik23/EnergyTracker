import { beforeEach, describe, expect, it, vi } from 'vitest';
import { zonesOfCountry, type ZoneSnapshot } from '@energy/core';

const ec = vi.hoisted(() => ({
  fetchPublicPower: vi.fn(),
  fetchPrice: vi.fn(),
  fetchCo2: vi.fn(),
}));
const pse = vi.hoisted(() => ({ fetchRce: vi.fn() }));

vi.mock('../src/sources/energyCharts', async (orig) => ({
  ...(await orig<typeof import('../src/sources/energyCharts')>()),
  ...ec,
}));
vi.mock('../src/sources/pse', async (orig) => ({
  ...(await orig<typeof import('../src/sources/pse')>()),
  ...pse,
}));

const { buildCountry } = await import('../src/snapshot');

const now = new Date('2026-11-27T15:00:00Z'); // 16:00 in Stockholm/Warsaw
const mixPoint = { t: '2026-11-27T14:00:00.000Z', mw: { wind: 100 }, co2: 11, renewableShare: 100 };
const price = (day: string, v: number) => [
  { t: `${day}T11:00:00.000Z`, v },
  { t: `${day}T12:00:00.000Z`, v },
];

beforeEach(() => {
  vi.resetAllMocks();
  ec.fetchPublicPower.mockResolvedValue({ mix: [mixPoint], intervalMinutes: 15 });
  ec.fetchCo2.mockResolvedValue({
    measured: [{ t: '2026-11-27T14:00:00.000Z', v: 15 }],
    forecast: [{ t: '2026-11-27T16:00:00.000Z', v: 20 }],
  });
  ec.fetchPrice.mockImplementation(async (bzn: string) => [
    ...price('2026-11-27', bzn === 'SE1' ? 10 : 50),
    ...price('2026-11-28', 60),
  ]);
});

describe('buildCountry', () => {
  it('fetches the mix once per country and prices once per zone', async () => {
    const snaps = await buildCountry('se', zonesOfCountry('se'), { now });
    expect(snaps.map((s) => s.zone)).toEqual(['se1', 'se2', 'se3', 'se4']);
    expect(ec.fetchPublicPower).toHaveBeenCalledTimes(1);
    expect(ec.fetchCo2).toHaveBeenCalledTimes(1);
    expect(ec.fetchPrice).toHaveBeenCalledTimes(4);
    expect(snaps[0]!.prices[0]!.points[0]!.v).toBe(10);
    expect(snaps[2]!.prices[0]!.points[0]!.v).toBe(50);
    expect(snaps.every((s) => s.mix.length === 1)).toBe(true);
  });

  it('reuses cached prices and forecast when they are fresh', async () => {
    const first = await buildCountry('se', zonesOfCountry('se'), { now });
    vi.clearAllMocks();
    const previous = new Map<string, ZoneSnapshot>(first.map((s) => [s.zone!, s]));
    const later = new Date(now.getTime() + 15 * 60_000);
    const second = await buildCountry('se', zonesOfCountry('se'), { now: later, previous });
    expect(ec.fetchPublicPower).toHaveBeenCalledTimes(1);
    expect(ec.fetchPrice).not.toHaveBeenCalled();
    expect(ec.fetchCo2).not.toHaveBeenCalled();
    expect(second[0]!.prices[0]!.points).toEqual(first[0]!.prices[0]!.points);
  });

  it('keeps cached prices when a refresh fails', async () => {
    const first = await buildCountry('pl', zonesOfCountry('pl'), { now });
    const stale = first.map((s) => ({
      ...s,
      prices: s.prices.map((p) => ({ ...p, fetchedAt: '2026-11-27T05:00:00Z' })),
    }));
    ec.fetchPrice.mockRejectedValue(new Error('429'));
    pse.fetchRce.mockRejectedValue(new Error('down'));
    const [snap] = await buildCountry('pl', zonesOfCountry('pl'), {
      now,
      previous: new Map(stale.map((s) => [s.zone!, s])),
    });
    expect(snap!.prices.find((p) => p.currency === 'EUR')!.points).toHaveLength(4);
  });

  it('puts PLN (PSE RCE) first for Poland', async () => {
    pse.fetchRce.mockResolvedValue(price('2026-11-27', 900));
    const [snap] = await buildCountry('pl', zonesOfCountry('pl'), { now });
    expect(snap!.prices.map((p) => p.currency)).toEqual(['PLN', 'EUR']);
    expect(snap!.sources.map((s) => s.name)).toContain('PSE S.A. — raporty.pse.pl (RCE)');
  });

  it('skips the mix for countries without one and still publishes prices (Denmark)', async () => {
    const snaps = await buildCountry('dk', zonesOfCountry('dk'), { now });
    expect(ec.fetchPublicPower).not.toHaveBeenCalled();
    expect(snaps).toHaveLength(2);
    expect(snaps[0]!.mix).toEqual([]);
    expect(snaps[0]!.prices[0]!.points.length).toBeGreaterThan(0);
  });

  it('fails when there is neither mix nor prices', async () => {
    ec.fetchPublicPower.mockRejectedValue(new Error('HTTP 503'));
    ec.fetchPrice.mockRejectedValue(new Error('HTTP 500'));
    await expect(buildCountry('cz', zonesOfCountry('cz'), { now })).rejects.toThrow('503');
  });

  it('falls back to the cached mix from today when the mix call fails', async () => {
    const first = await buildCountry('cz', zonesOfCountry('cz'), { now });
    ec.fetchPublicPower.mockRejectedValue(new Error('HTTP 503'));
    const [snap] = await buildCountry('cz', zonesOfCountry('cz'), {
      now,
      previous: new Map(first.map((s) => [s.zone!, s])),
    });
    expect(snap!.mix).toEqual([mixPoint]);
  });

  it('drops forecast points that are already measured', async () => {
    ec.fetchCo2.mockResolvedValue({
      measured: [{ t: '2026-11-27T14:00:00.000Z', v: 15 }],
      forecast: [
        { t: '2026-11-27T13:00:00.000Z', v: 1 },
        { t: '2026-11-27T16:00:00.000Z', v: 2 },
      ],
    });
    const [snap] = await buildCountry('pl', zonesOfCountry('pl'), { now });
    expect(snap!.co2Forecast).toEqual([{ t: '2026-11-27T16:00:00.000Z', v: 2 }]);
    expect(snap!.co2Measured).toEqual([{ t: '2026-11-27T14:00:00.000Z', v: 15 }]);
  });
});
