export * from "./types";
export * from "./properties";
export * from "./admin";
export * from "./research";
export * from "./scenarios";
export * from "./services";
export * from "./property-photos";

/**
 * Shared fetch helper for future use or to consolidate boilerplate.
 * (Currently most functions use individual fetch calls as per existing code)
 */
export async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let errorData;
    try {
      errorData = await res.json();
    } catch (e: unknown) {
      errorData = { message: res.statusText };
    }
    throw new Error(errorData.message || errorData.error || `Request failed with status ${res.status}`);
  }

  return res.json();
}
