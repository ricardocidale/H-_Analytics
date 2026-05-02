/**
 * queryClient.ts — Central React Query configuration for the application.
 *
 * Caching strategy:
 *   • staleTime: Infinity — once data is fetched, it is never automatically
 *     refetched in the background. This is intentional because the financial
 *     model is expensive to recompute and changes only when the user explicitly
 *     saves. Mutations use `invalidateQueries` to force a fresh fetch after writes.
 *   • refetchOnWindowFocus: false — prevents surprise data reloads when the user
 *     alt-tabs back to the app.
 *   • retry: false — API errors surface immediately rather than being retried,
 *     since most failures (401, 404) are not transient.
 *
 * Helper utilities:
 *   • `apiRequest(method, url, data?)` — a thin fetch wrapper that attaches JSON
 *     headers, sends credentials (cookies), and throws on non-OK responses.
 *   • `getQueryFn({ on401 })` — factory for query functions used by React Query.
 *     When on401 is "returnNull", a 401 response returns null instead of throwing
 *     (useful for optional auth checks). Otherwise it throws so error boundaries
 *     can catch it.
 *   • `safeReadJson(res)` — reads a Response body as text and tries `JSON.parse`,
 *     returning `null` on empty bodies or non-JSON content (e.g. proxy 502 HTML
 *     pages, gateway timeouts). Lets callers degrade to a status-based error
 *     instead of throwing the cryptic "Unexpected end of JSON input".
 *   • `ApiError` — Error subclass thrown by `throwIfResNotOk` / `apiRequest` /
 *     `getQueryFn`. Carries `status`, `statusText`, `body` (parsed JSON if
 *     possible, otherwise the raw text or null), and `bodyText`, so callers can
 *     branch on the status or extract structured fields like `retryAfter`.
 */
import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Error thrown for non-OK API responses. Exposes the status, the parsed body
 * (or raw text fallback), and the original body text so callers can branch on
 * status codes or extract structured fields. The `message` is already a clean,
 * user-presentable string built by `buildResponseErrorMessage`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: unknown;
  readonly bodyText: string;

  constructor(
    message: string,
    init: { status: number; statusText: string; body: unknown; bodyText: string },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = init.status;
    this.statusText = init.statusText;
    this.body = init.body;
    this.bodyText = init.bodyText;
  }
}

/**
 * Reads a response body as text and tries to parse it as JSON. Returns `null`
 * for empty bodies or non-JSON content (e.g. proxy 502 HTML pages, gateway
 * timeouts, misrouted requests). The body is consumed.
 *
 * Use this anywhere you would otherwise call `await res.json()` directly so
 * that an empty or HTML response doesn't surface as the cryptic
 * "Unexpected end of JSON input" error.
 */
export async function safeReadJson<T = unknown>(res: Response): Promise<T | null> {
  let text = "";
  try {
    text = await res.text();
  } catch {
    return null;
  }
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Builds a human-readable error message from a non-OK response, tolerating
 * empty bodies, HTML error pages, and other non-JSON content. Prefers the
 * server's `error` (or `message`) field when the body parses as JSON;
 * otherwise falls back to a `"<fallback> (HTTP 502 Bad Gateway)"` style
 * message with a short body excerpt when the body is short readable text.
 *
 * Returns `{ message, body, bodyText }` so the caller can attach the parsed
 * body to an `ApiError`.
 */
async function buildResponseErrorInfo(
  res: Response,
  fallback: string,
): Promise<{ message: string; body: unknown; bodyText: string }> {
  let bodyText = "";
  try {
    bodyText = await res.text();
  } catch {
    /* body unreadable */
  }

  const statusLabel = res.statusText
    ? `${res.status} ${res.statusText}`
    : `${res.status}`;

  let parsed: unknown = null;
  if (bodyText) {
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      /* not JSON — keep `parsed` as null */
    }
  }

  if (parsed && typeof parsed === "object") {
    const obj = parsed as { error?: unknown; message?: unknown };
    const fromError = typeof obj.error === "string" ? obj.error.trim() : "";
    if (fromError) {
      return { message: fromError, body: parsed, bodyText };
    }
    const fromMessage = typeof obj.message === "string" ? obj.message.trim() : "";
    if (fromMessage) {
      return { message: fromMessage, body: parsed, bodyText };
    }
  }

  const excerpt = bodyText.trim().slice(0, 200);
  if (excerpt && !/^<!?doctype|^<html/i.test(excerpt) && !parsed) {
    return {
      message: `${fallback} (HTTP ${statusLabel}): ${excerpt}`,
      body: bodyText,
      bodyText,
    };
  }
  return {
    message: `${fallback} (HTTP ${statusLabel})`,
    body: parsed ?? (bodyText || null),
    bodyText,
  };
}

async function throwIfResNotOk(res: Response, fallbackMessage = "Request failed"): Promise<void> {
  if (res.ok) return;
  const info = await buildResponseErrorInfo(res, fallbackMessage);
  throw new ApiError(info.message, {
    status: res.status,
    statusText: res.statusText,
    body: info.body,
    bodyText: info.bodyText,
  });
}

/**
 * Reads a non-OK response and returns a clean human-readable error message.
 * Convenience wrapper around `buildResponseErrorInfo` for callsites that
 * already use raw `fetch` and want a friendly toast string without throwing.
 */
export async function readResponseErrorMessage(
  res: Response,
  fallback = "Request failed",
): Promise<string> {
  const info = await buildResponseErrorInfo(res, fallback);
  return info.message;
}

/**
 * Reads the non-httpOnly `csrf_token` cookie that the auth middleware mirrors
 * from the session id. Returns undefined if the cookie isn't present (e.g.,
 * SSR or unauthenticated requests). Used by `apiRequest` to attach the
 * `x-csrf-token` header for state-changing requests (double-submit pattern).
 */
function readCsrfCookie(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("csrf_token="));
  if (!match) return undefined;
  return decodeURIComponent(match.slice("csrf_token=".length));
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: { fallbackMessage?: string },
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (data) headers["Content-Type"] = "application/json";
  if (!SAFE_METHODS.has(method.toUpperCase())) {
    const csrfToken = readCsrfCookie();
    if (csrfToken) headers["x-csrf-token"] = csrfToken;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res, options?.fallbackMessage);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
const getQueryFn = <T>({
  on401: unauthorizedBehavior,
}: {
  on401: UnauthorizedBehavior;
}): QueryFunction<T> =>
  (async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    // Use safeReadJson instead of `res.json()` so that an empty or non-JSON
    // 200 response (e.g. an HTML page from a misconfigured proxy) doesn't
    // surface as the cryptic "Unexpected end of JSON input". A null result
    // here means the body wasn't valid JSON, which we surface as `null` so
    // React Query callers can handle it the same way they would a missing
    // resource.
    return await safeReadJson<T>(res);
  }) as QueryFunction<T>;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
