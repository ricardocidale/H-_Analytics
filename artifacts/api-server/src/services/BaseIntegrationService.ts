import { logger } from "../logger";

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

export abstract class BaseIntegrationService {
  protected serviceName: string;
  protected timeoutMs: number;
  private circuitBreaker: CircuitBreakerState = { failures: 0, lastFailure: 0, isOpen: false };
  private readonly maxFailures = 5;
  private readonly resetWindowMs = 60_000;

  constructor(serviceName: string, timeoutMs = 10_000) {
    this.serviceName = serviceName;
    this.timeoutMs = timeoutMs;
  }

  protected async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    if (this.isCircuitOpen()) {
      throw new Error(`${this.serviceName}: Circuit breaker open — too many recent failures`);
    }

    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        this.recordFailure();
        throw new Error(`${this.serviceName}: HTTP ${response.status}`);
      }

      this.recordSuccess();
      return response;
    } catch (error: unknown) {
      if (error instanceof Error && !error.message.startsWith(this.serviceName)) {
        this.recordFailure();
      }
      throw error;
    }
  }

  private isCircuitOpen(): boolean {
    if (!this.circuitBreaker.isOpen) return false;
    if (Date.now() - this.circuitBreaker.lastFailure > this.resetWindowMs) {
      this.circuitBreaker = { failures: 0, lastFailure: 0, isOpen: false };
      return false;
    }
    return true;
  }

  private recordFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();
    if (this.circuitBreaker.failures >= this.maxFailures) {
      this.circuitBreaker.isOpen = true;
      logger.warn(`${this.serviceName}: Circuit breaker opened after ${this.maxFailures} failures`, this.serviceName);
    }
  }

  private recordSuccess(): void {
    if (this.circuitBreaker.failures > 0) {
      this.circuitBreaker = { failures: 0, lastFailure: 0, isOpen: false };
    }
  }

  protected log(message: string): void {
    logger.info(message, this.serviceName);
  }

  protected warn(message: string, error?: unknown): void {
    logger.warn(`${message} ${error ?? ""}`, this.serviceName);
  }
}
