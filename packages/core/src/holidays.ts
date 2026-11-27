/**
 * Public holidays. Tariff zones treat them like Sundays, and demand (so prices
 * and CO₂) drops on them, so both the tariff engine and the forecast need them.
 * Poland is exact (including Christmas Eve, a public holiday since 2025);
 * other countries list the holidays with a clear effect on demand.
 */

/** Gregorian Easter Sunday (anonymous algorithm), as YYYY-MM-DD. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const cache = new Map<string, ReadonlySet<string>>();

export function holidays(country: string, year: number): ReadonlySet<string> {
  const key = `${country}-${year}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const easter = easterSunday(year);
  const y = (md: string) => `${year}-${md}`;
  const common = [y('01-01'), shiftDate(easter, -2), easter, shiftDate(easter, 1), y('12-25'), y('12-26')];
  const extra: Record<string, string[]> = {
    pl: [
      y('01-06'),
      y('05-01'),
      y('05-03'),
      shiftDate(easter, 49),
      shiftDate(easter, 60),
      y('08-15'),
      y('11-01'),
      y('11-11'),
      ...(year >= 2025 ? [y('12-24')] : []),
    ],
    de: [y('05-01'), shiftDate(easter, 39), shiftDate(easter, 50), y('10-03')],
    cz: [y('05-01'), y('05-08'), y('07-05'), y('07-06'), y('09-28'), y('10-28'), y('11-17'), y('12-24')],
    fr: [
      y('05-01'),
      y('05-08'),
      shiftDate(easter, 39),
      shiftDate(easter, 50),
      y('07-14'),
      y('08-15'),
      y('11-01'),
      y('11-11'),
    ],
  };
  const set = new Set([...common, ...(extra[country] ?? [])]);
  cache.set(key, set);
  return set;
}

export function isHoliday(country: string, date: string): boolean {
  return holidays(country, Number(date.slice(0, 4))).has(date);
}
