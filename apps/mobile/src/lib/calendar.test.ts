import { describe, expect, it } from 'vitest';
import { binOf, dayTitle, monthGrid, monthTitle, quantileBreaks, shiftMonth, yearBefore } from './calendar';

describe('calendar helpers', () => {
  it('formats Polish titles', () => {
    expect(monthTitle('2025-05')).toBe('maj 2025');
    expect(dayTitle('2025-05-15')).toBe('czwartek, 15 maja 2025');
  });

  it('builds a Monday-first grid', () => {
    const grid = monthGrid('2025-05'); // 1 May 2025 is a Thursday
    expect(grid.slice(0, 4)).toEqual([null, null, null, '2025-05-01']);
    expect(grid.length % 7).toBe(0);
    expect(grid.filter(Boolean)).toHaveLength(31);
  });

  it('shifts months across years', () => {
    expect(shiftMonth('2025-01', -1)).toBe('2024-12');
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
  });

  it('goes back a year, clamping leap days', () => {
    expect(yearBefore('2025-05-15')).toBe('2024-05-15');
    expect(yearBefore('2024-02-29')).toBe('2023-02-28');
  });

  it('bins values by quantiles', () => {
    const breaks = quantileBreaks([1, 2, 3, 4, 5, 6, 7, 8], 4);
    expect(breaks).toHaveLength(3);
    expect(binOf(1, breaks)).toBe(0);
    expect(binOf(8, breaks)).toBe(3);
  });
});
