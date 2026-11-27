import type { Point, PriceSeries } from '@energy/core';

export function formatTime(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('pl-PL', { timeZone, hour: '2-digit', minute: '2-digit' }).format(
    typeof iso === 'string' ? new Date(iso) : iso,
  );
}

export function localDay(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(typeof iso === 'string' ? new Date(iso) : iso);
}

/** "dziś" / "jutro" / weekday, relative to now in the given zone. */
export function dayLabel(iso: string, timeZone: string, now = new Date()): string {
  const d = localDay(iso, timeZone);
  const today = localDay(now, timeZone);
  const tomorrow = localDay(new Date(now.getTime() + 86_400_000), timeZone);
  if (d === today) return 'dziś';
  if (d === tomorrow) return 'jutro';
  return new Intl.DateTimeFormat('pl-PL', { timeZone, weekday: 'short' }).format(new Date(iso));
}

export function formatRange(startIso: string, endIso: string, timeZone: string): string {
  return `${dayLabel(startIso, timeZone)} ${formatTime(startIso, timeZone)}–${formatTime(endIso, timeZone)}`;
}

/** Wholesale price per MWh -> per kWh, formatted for the series' currency. */
export function formatPricePerKwh(perMwh: number, currency: PriceSeries['currency']): string {
  const perKwh = perMwh / 1000;
  if (currency === 'PLN')
    return `${perKwh.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł/kWh`;
  return `${(perKwh * 100).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} c€/kWh`;
}

export function formatMoney(amount: number, currency: PriceSeries['currency']): string {
  if (currency === 'PLN')
    return `${amount.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
  return `${amount.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function formatNumber(n: number, digits = 0): string {
  return n.toLocaleString('pl-PL', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export type Co2Level = 'good' | 'warning' | 'serious' | 'critical';

/** Rough bands for European grids (g CO₂/kWh). */
export function co2Level(g: number): { level: Co2Level; label: string; icon: string } {
  if (g < 150) return { level: 'good', label: 'Czysto', icon: '✓' };
  if (g < 400) return { level: 'warning', label: 'Umiarkowanie', icon: '~' };
  if (g < 650) return { level: 'serious', label: 'Brudno', icon: '!' };
  return { level: 'critical', label: 'Bardzo brudno', icon: '‼' };
}

/** Averages points into hourly buckets (keyed by UTC hour start). */
export function toHourly(points: Point[]): Point[] {
  const buckets = new Map<number, { sum: number; n: number }>();
  for (const p of points) {
    const h = Math.floor(Date.parse(p.t) / 3_600_000) * 3_600_000;
    const b = buckets.get(h) ?? { sum: 0, n: 0 };
    b.sum += p.v;
    b.n += 1;
    buckets.set(h, b);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([h, b]) => ({ t: new Date(h).toISOString(), v: b.sum / b.n }));
}
