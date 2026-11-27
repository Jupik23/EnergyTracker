const USER_AGENT = 'energy-dashboard-pipeline/0.1';

export interface FetchOptions {
  retries?: number;
  timeoutMs?: number;
  /** Base backoff in ms; doubles each retry. Energy-Charts rate-limits aggressively (HTTP 429). */
  backoffMs?: number;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const { retries = 4, timeoutMs = 30_000, backoffMs = 5_000 } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return (await res.json()) as T;
      lastError = new HttpError(res.status, url);
      // 4xx other than 429 will not get better on retry.
      if (res.status !== 429 && res.status < 500) throw lastError;
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs * 2 ** attempt,
      );
    } catch (err) {
      if (err instanceof HttpError && err.status !== 429 && err.status < 500) throw err;
      lastError = err;
      if (attempt < retries) await sleep(backoffMs * 2 ** attempt);
    }
  }
  throw lastError;
}

/** Polite pause between calls to the same host. */
export const pause = (ms = 2_000) => sleep(ms);
