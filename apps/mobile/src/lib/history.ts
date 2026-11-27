import { useEffect, useState } from 'react';
import type { HistoryDaily, HistoryIndex, HistoryMonth } from '@energy/core';

/** History lives on its own branch so the 15-minute data branch stays small. */
export const HISTORY_URL =
  process.env.EXPO_PUBLIC_HISTORY_URL ??
  'https://raw.githubusercontent.com/Jupik23/EnergyTracker/history/v1/history';

// Past months never change, so a module-level cache is enough for a session.
const cache = new Map<string, Promise<unknown>>();

function getJson<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined;
  if (!p) {
    p = fetch(`${HISTORY_URL}/${path}`).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<T>;
    });
    p.catch(() => cache.delete(path)); // allow retry after a failure
    cache.set(path, p);
  }
  return p;
}

export interface Loadable<T> {
  data: T | null;
  error: string | null;
}

function useJson<T>(path: string | null): Loadable<T> {
  const [state, setState] = useState<Loadable<T> & { path: string | null }>({
    data: null,
    error: null,
    path: null,
  });
  useEffect(() => {
    if (!path) return;
    let alive = true;
    getJson<T>(path)
      .then((data) => alive && setState({ data, error: null, path }))
      .catch((e: unknown) => alive && setState({ data: null, error: String(e), path }));
    return () => {
      alive = false;
    };
  }, [path]);
  // Never show data that belongs to a previous path while the new one loads.
  return state.path === path ? state : { data: null, error: null };
}

export const useHistoryIndex = () => useJson<HistoryIndex>('index.json');
export const useHistoryDaily = (country: string | null) =>
  useJson<HistoryDaily>(country ? `${country}/daily.json` : null);
export const useHistoryMonth = (country: string | null, month: string | null) =>
  useJson<HistoryMonth>(country && month ? `${country}/${month}.json` : null);
