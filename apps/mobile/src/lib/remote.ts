import { useEffect, useState } from 'react';
import { DATA_URL } from './data';

export type Remote<T> =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ok'; data: T };

const cache = new Map<string, { at: number; data: unknown }>();
const TTL_MS = 10 * 60_000;

function fresh(path: string): unknown {
  const hit = cache.get(path);
  return hit && Date.now() - hit.at < TTL_MS ? hit.data : undefined;
}

/**
 * Fetches an optional JSON file from the static data branch (forecast,
 * one-year prices…). 404 is a normal state — not every zone has every file —
 * and is reported as `missing`, not as an error.
 */
export function useRemoteJson<T>(path: string | null): Remote<T> {
  const [result, setResult] = useState<{ path: string; remote: Remote<T> } | null>(null);

  useEffect(() => {
    if (!path || fresh(path) !== undefined) return;
    let cancelled = false;
    fetch(`${DATA_URL}/${path}`)
      .then(async (res): Promise<Remote<T>> => {
        if (res.status === 404) return { status: 'missing' };
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as T;
        cache.set(path, { at: Date.now(), data });
        return { status: 'ok', data };
      })
      .catch((e: unknown): Remote<T> => ({
        status: 'error',
        message: e instanceof Error ? e.message : String(e),
      }))
      .then((remote) => {
        if (!cancelled) setResult({ path, remote });
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!path) return { status: 'missing' };
  const cached = fresh(path);
  if (cached !== undefined) return { status: 'ok', data: cached as T };
  if (result?.path === path) return result.remote;
  return { status: 'loading' };
}
