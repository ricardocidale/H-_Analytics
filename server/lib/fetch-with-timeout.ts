/**
 * fetch-with-timeout.ts — Shared fetch wrapper with mandatory timeout.
 *
 * Every external HTTP call should use this instead of bare fetch().
 * The audit test `tests/audit/no-fetch-without-timeout.test.ts` enforces
 * that all fetch() calls in server/integrations/ include a signal.
 * This utility makes compliance easy.
 *
 * Usage:
 *   import { fetchWithTimeout } from "../lib/fetch-with-timeout";
 *   const res = await fetchWithTimeout("https://api.example.com/data", {
 *     method: "POST",
 *     headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify(payload),
 *   }, 10_000);
 */

/**
 * Fetch with a mandatory timeout. Throws AbortError if the request exceeds
 * the timeout. The caller should catch and handle gracefully.
 *
 * @param url - The URL to fetch
 * @param init - Standard RequestInit options (method, headers, body, etc.)
 * @param timeoutMs - Timeout in milliseconds (default: 10000)
 * @returns The fetch Response
 */
export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs: number = 10_000,
): Promise<Response> {
  const signal = AbortSignal.timeout(timeoutMs);

  // If the caller already set a signal, combine them
  if (init?.signal) {
    const combined = AbortSignal.any([signal, init.signal]);
    return fetch(url, { ...init, signal: combined });
  }

  return fetch(url, { ...init, signal });
}
