import { cache } from "../cache";
import { logger } from "../logger";
import { startSpanAsync } from "../sentry";
import {
  CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  CIRCUIT_BREAKER_WINDOW_MS,
  CIRCUIT_BREAKER_COOLDOWN_MS,
  RETRY_MAX_ATTEMPTS,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
} from "../constants";

export type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreakerConfig {
  failureThreshold: number;
  windowMs: number;
  cooldownMs: number;
}

interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

interface CircuitBreakerState {
  state: CircuitState;
  failureTimestamps: number[];
  lastFailureAt: number;
  openedAt: number;
  lastErrorMessage?: string;
}

export interface IntegrationHealth {
  name: string;
  healthy: boolean;
  latencyMs: number;
  lastError?: string;
  lastErrorAt?: number;
  circuitState: CircuitState;
}

const circuitBreakers = new Map<string, CircuitBreakerState>();

function getCircuitState(name: string): CircuitBreakerState {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, {
      state: "closed",
      failureTimestamps: [],
      lastFailureAt: 0,
      openedAt: 0,
    });
  }
  return circuitBreakers.get(name)!;
}

export abstract class BaseIntegrationService {
  abstract readonly serviceName: string;

  protected circuitConfig: CircuitBreakerConfig = {
    failureThreshold: CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    windowMs: CIRCUIT_BREAKER_WINDOW_MS,
    cooldownMs: CIRCUIT_BREAKER_COOLDOWN_MS,
  };

  protected retryConfig: RetryConfig = {
    maxAttempts: RETRY_MAX_ATTEMPTS,
    baseDelayMs: RETRY_BASE_DELAY_MS,
    maxDelayMs: RETRY_MAX_DELAY_MS,
  };

  abstract healthCheck(): Promise<IntegrationHealth>;

  getCircuitState(): CircuitState {
    const cb = getCircuitState(this.serviceName);
    if (cb.state === "open") {
      const elapsed = Date.now() - cb.openedAt;
      if (elapsed >= this.circuitConfig.cooldownMs) {
        cb.state = "half-open";
      }
    }
    return cb.state;
  }

  getLastError(): { lastError?: string; lastErrorAt?: number } {
    const cb = getCircuitState(this.serviceName);
    return {
      lastError: cb.lastErrorMessage,
      lastErrorAt: cb.lastFailureAt || undefined,
    };
  }

  protected async withCircuitBreaker<T>(fn: () => Promise<T>): Promise<T> {
    const cb = getCircuitState(this.serviceName);
    const state = this.getCircuitState();

    if (state === "open") {
      throw new Error(`${this.serviceName} circuit breaker is OPEN — service unavailable`);
    }

    try {
      const result = await fn();
      if (state === "half-open") {
        cb.state = "closed";
        cb.failureTimestamps = [];
        logger.info(`${this.serviceName} circuit breaker CLOSED (probe succeeded)`, "integration");
      }
      return result;
    } catch (error: unknown) {
      const now = Date.now();
      cb.lastFailureAt = now;
      cb.lastErrorMessage = error instanceof Error ? error.message : String(error);

      const windowStart = now - this.circuitConfig.windowMs;
      cb.failureTimestamps = cb.failureTimestamps.filter((t) => t >= windowStart);
      cb.failureTimestamps.push(now);

      if (cb.failureTimestamps.length >= this.circuitConfig.failureThreshold) {
        cb.state = "open";
        cb.openedAt = now;
        logger.warn(`${this.serviceName} circuit breaker OPENED after ${cb.failureTimestamps.length} failures in window`, "integration");
      }

      if (state === "half-open") {
        cb.state = "open";
        cb.openedAt = now;
        logger.warn(`${this.serviceName} circuit breaker re-OPENED (probe failed)`, "integration");
      }

      throw error;
    }
  }

  protected async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error: unknown) {
        lastError = error;
        if (!this.isTransientError(error)) throw error;
        if (attempt === this.retryConfig.maxAttempts) break;

        const delay = Math.min(
          // eslint-disable-next-line no-restricted-syntax -- retry backoff, non-financial
          this.retryConfig.baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 100,
          this.retryConfig.maxDelayMs,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  protected async withCache<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    return cache.cacheThrough(key, ttlSeconds, fn);
  }

  async execute<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    return startSpanAsync(`${this.serviceName}.${operation}`, "integration.call", () =>
      this.withCircuitBreaker(() => this.withRetry(fn)),
    );
  }

  private isTransientError(error: unknown): boolean {
    if (!error) return false;
    const err = error as Record<string, unknown>;
    const status = (err.status ?? err.statusCode ?? err.code) as number | undefined;
    if (typeof status === "number" && status === 429) return true; // Rate limited — retry with backoff
    if (typeof status === "number" && status >= 400 && status < 500) return false;
    if (typeof status === "number" && status >= 500) return true;
    const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
    if (msg.includes("econnreset") || msg.includes("econnrefused") || msg.includes("etimedout") || msg.includes("timeout") || msg.includes("network")) {
      return true;
    }
    return msg.includes("5") && msg.includes("error");
  }
}

export function getAllIntegrationHealth(): Map<string, CircuitBreakerState> {
  return circuitBreakers;
}
