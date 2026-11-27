import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { CountryCode, CountrySnapshot } from '@energy/core';

/**
 * Data is published as static JSON by the scheduled pipeline to the `data`
 * branch. Override with EXPO_PUBLIC_DATA_URL (e.g. a local folder served over
 * HTTP while developing the pipeline).
 */
export const DATA_URL =
  process.env.EXPO_PUBLIC_DATA_URL ?? 'https://raw.githubusercontent.com/Jupik23/EnergyTracker/data/v1';

const REFRESH_MS = 5 * 60_000;

interface DataState {
  country: CountryCode;
  setCountry: (c: CountryCode) => void;
  snapshot: CountrySnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const Ctx = createContext<DataState | null>(null);

async function fetchSnapshot(c: CountryCode): Promise<CountrySnapshot> {
  const res = await fetch(`${DATA_URL}/${c}/latest.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as CountrySnapshot;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [country, setCountry] = useState<CountryCode>('pl');
  const [cache, setCache] = useState<Partial<Record<CountryCode, CountrySnapshot>>>({});
  const [errors, setErrors] = useState<Partial<Record<CountryCode, string>>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((c: CountryCode) => {
    fetchSnapshot(c)
      .then((snap) => {
        setCache((prev) => ({ ...prev, [c]: snap }));
        setErrors((prev) => ({ ...prev, [c]: undefined }));
      })
      .catch((e: unknown) => {
        const msg = `Nie udało się pobrać danych (${e instanceof Error ? e.message : String(e)})`;
        setErrors((prev) => ({ ...prev, [c]: msg }));
      })
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => {
    load(country);
    const id = setInterval(() => load(country), REFRESH_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && load(country));
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [country, load]);

  const snapshot = cache[country] ?? null;
  const error = errors[country] ?? null;
  const value = useMemo<DataState>(
    () => ({
      country,
      setCountry,
      snapshot,
      loading: refreshing || (!snapshot && !error),
      error,
      refresh: () => {
        setRefreshing(true);
        load(country);
      },
    }),
    [country, snapshot, refreshing, error, load],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData must be used inside <DataProvider>');
  return v;
}
