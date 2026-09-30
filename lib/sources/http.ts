export class SourceError extends Error {}

export function sourceMode(): "live" | "mock" {
  return process.env.SOURCE_MODE === "mock" ? "mock" : "live";
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new SourceError(`HTTP ${res.status} from ${new URL(url).host}`);
    return res;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new SourceError(`Timed out after ${timeoutMs / 1000}s (${new URL(url).host})`);
    if (e instanceof SourceError) throw e;
    throw new SourceError(`Could not reach ${new URL(url).host}: ${(e as Error).message}`);
  }
}

export async function getJson<T>(url: string, headers: Record<string, string> = {}, timeoutMs?: number): Promise<T> {
  const res = await fetchWithTimeout(url, { headers: { Accept: "application/json", ...headers } }, timeoutMs);
  return (await res.json()) as T;
}

export async function getText(url: string, headers: Record<string, string> = {}, timeoutMs?: number): Promise<string> {
  const res = await fetchWithTimeout(url, { headers }, timeoutMs);
  return res.text();
}
