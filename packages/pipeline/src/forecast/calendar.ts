/** Local-time calendar features (hour, weekday) for the forecast model. */
export { isHoliday } from '@energy/core';

const HOUR = 3_600_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };

export interface LocalParts {
  /** YYYY-MM-DD */
  date: string;
  hour: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

export function localParts(ms: number, timeZone: string): LocalParts {
  const parts = formatter(timeZone).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
    weekday: WEEKDAYS[get('weekday')] ?? 0,
  };
}

/** Floors a timestamp to the UTC hour. All European offsets are whole hours. */
export const floorHour = (ms: number) => Math.floor(ms / HOUR) * HOUR;
