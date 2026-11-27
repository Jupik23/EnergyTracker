const USER_AGENT = 'energy-dashboard-pipeline/0.2';

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

/**
 * Minimum gap between two requests to the same host. Energy-Charts answers
 * 429 after a handful of back-to-back calls; ~2.5 s keeps a full run clean.
 */
export const HOST_GAP_MS = Number(process.env.PIPELINE_HOST_GAP_MS ?? 2_500);
const lastCallAt = new Map<string, number>();

/** Per-run counters, printed at the end of a run to keep an eye on rate limiting. */
export const httpStats = { requests: 0, retries: 0, rateLimited: 0 };

async function paceHost(url: string): Promise<void> {
  const host = new URL(url).host;
  const wait = (lastCallAt.get(host) ?? 0) + HOST_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt.set(host, Date.now());
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const { retries = 4, timeoutMs = 30_000, backoffMs = 5_000 } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await paceHost(url);
      httpStats.requests++;
      if (attempt > 0) httpStats.retries++;
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return (await res.json()) as T;
      lastError = new HttpError(res.status, url);
      // 4xx other than 429 will not get better on retry.
      if (res.status !== 429 && res.status < 500) throw lastError;
      if (res.status === 429) httpStats.rateLimited++;
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
