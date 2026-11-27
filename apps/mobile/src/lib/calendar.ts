export const MONTHS_PL = [
  'styczeń',
  'luty',
  'marzec',
  'kwiecień',
  'maj',
  'czerwiec',
  'lipiec',
  'sierpień',
  'wrzesień',
  'październik',
  'listopad',
  'grudzień',
];
export const MONTHS_PL_GENITIVE = [
  'stycznia',
  'lutego',
  'marca',
  'kwietnia',
  'maja',
  'czerwca',
  'lipca',
  'sierpnia',
  'września',
  'października',
  'listopada',
  'grudnia',
];
export const MONTHS_PL_SHORT = [
  'sty',
  'lut',
  'mar',
  'kwi',
  'maj',
  'cze',
  'lip',
  'sie',
  'wrz',
  'paź',
  'lis',
  'gru',
];
export const WEEKDAYS_PL = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
const WEEKDAYS_LONG = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];

const parts = (date: string) => date.split('-').map(Number) as [number, number, number];

/** "maj 2025" */
export function monthTitle(month: string): string {
  const [y, m] = parts(month);
  return `${MONTHS_PL[m - 1]} ${y}`;
}

/** "czwartek, 15 maja 2025" */
export function dayTitle(date: string): string {
  const [y, m, d] = parts(date);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS_LONG[dow]}, ${d} ${MONTHS_PL_GENITIVE[m - 1]} ${y}`;
}

/** Calendar grid for a month: Monday-first weeks, null for padding cells. */
export function monthGrid(month: string): (string | null)[] {
  const [y, m] = parts(month);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = parts(month);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** Same calendar day one year earlier (29 Feb → 28 Feb). */
export function yearBefore(date: string): string {
  const [y, m, d] = parts(date);
  const last = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
  return `${y - 1}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** Quantile thresholds splitting values into `bins` equally populated groups. */
export function quantileBreaks(values: number[], bins: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  return Array.from({ length: bins - 1 }, (_, i) => {
    const q = ((i + 1) / bins) * (sorted.length - 1);
    return sorted[Math.round(q)]!;
  });
}

export function binOf(value: number, breaks: number[]): number {
  let i = 0;
  while (i < breaks.length && value > breaks[i]!) i++;
  return i;
}
