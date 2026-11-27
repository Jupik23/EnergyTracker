import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import { DEFAULT_ZONE, findZone, type ZoneId, type ZoneSnapshot } from '@energy/core';
import { loadSetting, saveSetting } from './settings';

/**
 * Data is published as static JSON by the scheduled pipeline to the `data`
 * branch. Override with EXPO_PUBLIC_DATA_URL (e.g. a local folder served over
 * HTTP while developing the pipeline).
 */
export const DATA_URL =
  process.env.EXPO_PUBLIC_DATA_URL ?? 'https://raw.githubusercontent.com/Jupik23/EnergyTracker/data/v1';

const REFRESH_MS = 5 * 60_000;

interface DataState {
  zone: ZoneId;
  setZone: (z: ZoneId) => void;
  snapshot: ZoneSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const Ctx = createContext<DataState | null>(null);

async function fetchSnapshot(zone: ZoneId): Promise<ZoneSnapshot> {
  const res = await fetch(`${DATA_URL}/${zone}/latest.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ZoneSnapshot;
}

/**
 * `urlZone` (from `?zone=se3`) wins over the remembered choice, so links to a
 * specific zone can be shared.
 */
export function DataProvider({ children, urlZone }: { children: ReactNode; urlZone?: string }) {
  // null until the remembered zone is read, so we never fetch the default first and then switch.
  const [zone, setZoneState] = useState<ZoneId | null>(null);
  const [cache, setCache] = useState<Record<ZoneId, ZoneSnapshot>>({});
  const [errors, setErrors] = useState<Record<ZoneId, string | undefined>>({});
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadSetting('zone').then((saved) => {
      if (urlZone && findZone(urlZone)) {
        setZoneState(urlZone);
        saveSetting('zone', urlZone);
      } else {
        setZoneState(saved && findZone(saved) ? saved : DEFAULT_ZONE);
      }
    });
  }, [urlZone]);

  const setZone = useCallback((z: ZoneId) => {
    setZoneState(z);
    saveSetting('zone', z);
    // Keep the address bar shareable on web (no-op for navigation on native).
    router.setParams({ zone: z });
  }, []);

  const load = useCallback((z: ZoneId) => {
    fetchSnapshot(z)
      .then((snap) => {
        setCache((prev) => ({ ...prev, [z]: snap }));
        setErrors((prev) => ({ ...prev, [z]: undefined }));
      })
      .catch((e: unknown) => {
        const msg = `Nie udało się pobrać danych (${e instanceof Error ? e.message : String(e)})`;
        setErrors((prev) => ({ ...prev, [z]: msg }));
      })
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => {
    if (!zone) return;
    load(zone);
    const id = setInterval(() => load(zone), REFRESH_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && load(zone));
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [zone, load]);

  const current = zone ?? DEFAULT_ZONE;
  const snapshot = zone ? (cache[zone] ?? null) : null;
  const error = zone ? (errors[zone] ?? null) : null;
  const value = useMemo<DataState>(
    () => ({
      zone: current,
      setZone,
      snapshot,
      loading: refreshing || (!snapshot && !error),
      error,
      refresh: () => {
        setRefreshing(true);
        load(current);
      },
    }),
    [current, setZone, snapshot, refreshing, error, load],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData must be used inside <DataProvider>');
  return v;
}
