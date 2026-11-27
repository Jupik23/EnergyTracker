import type { Point } from './types';

export interface Window {
  start: string;
  /** Exclusive end of the window. */
  end: string;
  /** Average value over the window (price or g CO₂/kWh). */
  avg: number;
}

export interface BestWindowsOptions {
  /** Appliance run time in minutes. */
  durationMinutes: number;
  /** Earliest allowed start. Windows starting in the past are ignored. */
  notBefore?: Date;
  /** Latest allowed end (e.g. "must finish by 7:00"). */
  notAfter?: Date;
  /** How many non-overlapping windows to return. */
  limit?: number;
}

const MINUTE = 60_000;

/** Median spacing between consecutive points, in minutes. */
export function inferIntervalMinutes(points: Point[]): number {
  if (points.length < 2) return 60;
  const diffs: number[] = [];
  for (let i = 1; i < points.length; i++) {
    diffs.push((Date.parse(points[i]!.t) - Date.parse(points[i - 1]!.t)) / MINUTE);
  }
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)]!;
}

/**
 * Finds the cheapest (or cleanest) contiguous windows of `durationMinutes`.
 *
 * Works on any series of interval-start points (15-min or hourly). A window
 * only counts if every interval it covers is present — gaps break windows, so
 * we never recommend a slot we have no data for. Results are sorted by
 * average ascending and never overlap each other.
 */
export function bestWindows(points: Point[], opts: BestWindowsOptions): Window[] {
  const { durationMinutes, notBefore, notAfter, limit = 3 } = opts;
  if (points.length === 0 || durationMinutes <= 0) return [];

  const sorted = [...points].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const step = inferIntervalMinutes(sorted);
  const slots = Math.max(1, Math.ceil(durationMinutes / step));
  const stepMs = step * MINUTE;

  const candidates: (Window & { i: number })[] = [];
  for (let i = 0; i + slots <= sorted.length; i++) {
    const startMs = Date.parse(sorted[i]!.t);
    const endMs = startMs + slots * stepMs;
    if (notBefore && startMs < floorTo(notBefore.getTime(), stepMs)) continue;
    if (notAfter && endMs > notAfter.getTime()) continue;

    let sum = 0;
    let contiguous = true;
    for (let k = 0; k < slots; k++) {
      const p = sorted[i + k]!;
      if (Date.parse(p.t) !== startMs + k * stepMs) {
        contiguous = false;
        break;
      }
      sum += p.v;
    }
    if (!contiguous) continue;

    candidates.push({
      i,
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      avg: sum / slots,
    });
  }

  candidates.sort((a, b) => a.avg - b.avg || a.i - b.i);

  const picked: (Window & { i: number })[] = [];
  for (const c of candidates) {
    if (picked.length >= limit) break;
    const overlaps = picked.some((p) => c.i < p.i + slots && p.i < c.i + slots);
    if (!overlaps) picked.push(c);
  }
  return picked.map(({ start, end, avg }) => ({ start, end, avg }));
}

/** Average over the window that would start right now (the "do it now" baseline). */
export function windowStartingAt(points: Point[], at: Date, durationMinutes: number): Window | null {
  const sorted = [...points].sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const stepMs = inferIntervalMinutes(sorted) * MINUTE;
  const startMs = floorTo(at.getTime(), stepMs);
  const i = sorted.findIndex((p) => Date.parse(p.t) === startMs);
  if (i < 0) return null;
  const [w] = bestWindows(sorted.slice(i), {
    durationMinutes,
    notBefore: new Date(startMs),
    notAfter: new Date(startMs + Math.ceil((durationMinutes * MINUTE) / stepMs) * stepMs),
    limit: 1,
  });
  return w ?? null;
}

/** Floors to the interval grid. Works because all CET/CEST offsets are whole hours. */
function floorTo(ms: number, stepMs: number): number {
  return Math.floor(ms / stepMs) * stepMs;
}
