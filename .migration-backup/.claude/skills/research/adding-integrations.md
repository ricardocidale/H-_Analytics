---
name: Adding & Debugging Integrations
description: How to add new external service integrations, debug circuit breaker failures, and use the BaseIntegrationService pattern.
---

# Adding & Debugging Integrations

## Adding a New Integration Service

### Step 1: Extend BaseIntegrationService

```typescript
// server/integrations/my-service.ts
import { BaseIntegrationService, type IntegrationHealth } from "./base";

export class MyService extends BaseIntegrationService {
  readonly serviceName = "my-service";

  isAvailable(): boolean {
    return !!process.env.MY_SERVICE_API_KEY;
  }

  async healthCheck(): Promise<IntegrationHealth> {
    const start = Date.now();
    try {
      await this.execute("healthCheck", () => this.ping());
      return { name: this.serviceName, healthy: true, latencyMs: Date.now() - start, circuitState: this.getCircuitState() };
    } catch (error) {
      const { lastError, lastErrorAt } = this.getLastError();
      return { name: this.serviceName, healthy: false, latencyMs: Date.now() - start, lastError, lastErrorAt, circuitState: this.getCircuitState() };
    }
  }

  async fetchData(query: string): Promise<MyData> {
    return this.execute("fetchData", () =>
      this.withCache(`my-service:${query}`, 3600, async () => {
        // API call here
      })
    );
  }
}
```

### Step 2: Register in Route or Aggregator

- For market data: Add to `MarketIntelligenceAggregator` alongside FRED/Hospitality/Grounded
- For standalone: Create route in `server/routes/` and register in `server/routes.ts`

### Step 3: Add Health Check to Admin

Register in `server/routes/admin-integrations.ts` so it appears in Admin → Integrations.

### Step 4: Document

- Add env var to `.env.example`
- Add row to this skill's service table

## Debugging Failures

| Symptom | Check | Fix |
|---------|-------|-----|
| "circuit breaker is OPEN" | `getCircuitState()` returns "open" | Wait 30s cooldown or restart server to reset |
| Timeouts | Check `latencyMs` in health check | Increase timeout or check network |
| 4xx errors (not retried) | Check API key validity | Verify env var is set correctly |
| Partial MI results | Check `errors[]` in `MarketIntelligence` response | Individual service failures don't block others |
| Stale data | Check cache TTL | Call `refreshFREDRates()` or clear cache key |

## Circuit Breaker Configuration

Override defaults in your service constructor:

```typescript
this.circuitConfig = { failureThreshold: 3, windowMs: 30_000, cooldownMs: 15_000 };
this.retryConfig = { maxAttempts: 2, baseDelayMs: 500, maxDelayMs: 3_000 };
```

## Execution Pattern

All service calls should use `this.execute(operationName, fn)` which chains:
1. Sentry span tracing (`startSpanAsync`)
2. Circuit breaker check (`withCircuitBreaker`)
3. Retry with exponential backoff (`withRetry`)

For cached operations, nest `this.withCache()` inside the `fn` callback.

## Current Services

| Service | Env Var | Cache TTL | Purpose |
|---------|---------|-----------|---------|
| FRED | `FRED_API_KEY` | 24h | Macro rates (SOFR, Treasury, CPI) |
| Hospitality Benchmarks | `COSTAR_API_KEY` | 7 days | STR-style hotel performance data |
| Grounded Research | `PERPLEXITY_API_KEY` or `TAVILY_API_KEY` | None | Web search with citations |
| Resend | `RESEND_API_KEY` | None | Transactional email delivery |
| Document AI | `GOOGLE_CLOUD_PROJECT` | None | OCR field extraction |
