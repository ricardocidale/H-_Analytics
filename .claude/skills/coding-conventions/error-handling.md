---
name: error-handling
description: Error handling and resilience patterns covering server-side middleware, client error boundaries, FinancialCalculationError, Sentry integration, and the rule against empty catch blocks.
---

Error handling and resilience patterns for the hospitality financial model. Covers server-side error middleware, client-side error boundaries, the FinancialCalculationError class, Sentry integration, non-blocking side effects, and the rule against empty catch blocks. Use this skill when adding error handling, debugging crashes, or working on resilience.

## Server-Side Patterns

### `logAndSendError` — Standard Error Response

All server route error handling uses this helper from `server/routes/helpers.ts`:

```typescript
import { logAndSendError } from "./helpers";

try {
  // ... route logic
} catch (error) {
  return logAndSendError(res, "Failed to update property", error, "properties");
}
```

**Behavior:**
- Logs the error to console with optional domain tag: `[ERROR] [properties] Failed to update property`
- Sends a 500 JSON response: `{ error: "Failed to update property" }`
- Extracts `error.message` if the error is an `Error` instance

### `sendError` — Known Error Responses

For expected validation failures (400, 404, 403), use `sendError` directly:

```typescript
import { sendError } from "./helpers";

if (!property) return sendError(res, 404, "Property not found");
```

### Zod Validation Pattern

Request body validation uses Zod schemas with `fromZodError` for readable messages:

```typescript
import { fromZodError } from "zod-validation-error";

const parsed = createUserSchema.safeParse(req.body);
if (!parsed.success) {
  return sendError(res, 400, fromZodError(parsed.error).message);
}
```

### `logActivity` — Non-Blocking Side Effects

Activity logging is fire-and-forget. Errors never break the primary request:

```typescript
export function logActivity(req, action, entityType, entityId?, entityName?, metadata?): void {
  const userId = req.user?.id;
  if (!userId) return;
  storage.createActivityLog({ ... })
    .catch(err => console.error("[ERROR] [activity] Activity log error:", err?.message || err));
}
```

**Key rule:** Side effects like logging, notifications, and analytics must use `.catch()` to swallow errors. Never let a logging failure crash a user-facing request.

## Client-Side Error Boundaries

Three error boundary components in `client/src/components/ErrorBoundary.tsx`:

### `ErrorBoundary` — Top-Level Crash Recovery

Wraps the entire app. On error:
- Shows a friendly "Something went wrong" message
- Displays the error message
- Offers a "Reload page" button
- Reports to Sentry via `captureClientException`

```tsx
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

### `SelfHealingBoundary` — Auto-Retry with Exponential Backoff

Wraps sections where transient errors (async query timing, race conditions) are expected:

- Retries up to `maxRetries` (default: 3) times
- Exponential backoff: 300ms → 900ms → 2700ms (base × 3^retryCount)
- On retry exhaustion: shows fallback UI with "Try Again" + "Reload page" buttons
- Reports to Sentry only after all retries are exhausted

```tsx
<SelfHealingBoundary maxRetries={3} retryDelayMs={300}>
  <FinancialDashboard />
</SelfHealingBoundary>
```

### `FinancialErrorBoundary` — Calculation-Specific

Wraps financial calculation components. On error:
- Shows "Calculation Error" with guidance about invalid property/assumption data
- Displays the error message in monospace font
- Offers a "Retry" button (resets error state without page reload)
- Reports to Sentry

```tsx
<FinancialErrorBoundary>
  <PropertyProForma property={property} global={global} />
</FinancialErrorBoundary>
```

## `FinancialCalculationError`

Custom error class in `shared/errors.ts` for financial engine failures:

```typescript
throw new FinancialCalculationError("Negative depreciation basis", {
  propertyId: property.id,
  calculationType: "depreciation",
  inputs: { purchasePrice, landValuePercent, buildingImprovements },
  engineVersion: "1.0.0",
});
```

**Features:**
- `inputHash`: Deterministic hash of the input object for deduplication in Sentry
- `toSentryTags()`: Returns structured tags for Sentry scope
- `calculationType`: Identifies which engine stage failed (e.g., "depreciation", "debt-service")
- `propertyId`: Links the error to a specific property

**Use when:** A financial calculation receives inputs that would produce mathematically invalid results (negative values where positive required, division by zero scenarios, etc.).

## Sentry Integration

Client-side Sentry is initialized in `client/src/lib/sentry.ts`:

```typescript
import { captureClientException, setClientUser } from "@/lib/sentry";

// Report errors with optional tags
captureClientException(error, { boundary: "FinancialErrorBoundary" });

// Set user context after login
setClientUser({ id: user.id, email: user.email, role: user.role });
```

**Configuration:**
- DSN from `VITE_SENTRY_DSN` env var (disabled if not set)
- Production: 20% trace sample rate
- Development: 100% trace sample rate
- Browser tracing integration enabled
- Replay disabled (replaysOnErrorSampleRate: 0)

**Graceful degradation:** All Sentry calls are no-ops when DSN is not configured. The app never crashes due to Sentry being unavailable.

## Rules

### Empty Catch Blocks Are Not Permitted

Every `catch` block must either:
1. Log the error: `console.error(...)` or `logger.error(...)`
2. Re-throw: `throw error`
3. Handle meaningfully: retry, fallback value, user notification

```typescript
// WRONG — silent swallow
try { await riskyOp(); } catch {}

// CORRECT — log and continue
try { await riskyOp(); } catch (err) {
  console.error("[ERROR] riskyOp failed:", err);
}

// CORRECT — swallow with explicit intent (only for fire-and-forget side effects)
storage.createLog(data).catch(err => console.error("[ERROR] log failed:", err));
```

### Error Handling Checklist

- [ ] Server routes use `logAndSendError` for unexpected errors
- [ ] Validation errors return 400 with `fromZodError` messages
- [ ] Side effects (logging, notifications) use `.catch()` to prevent cascading failures
- [ ] Financial calculations wrap in `FinancialErrorBoundary`
- [ ] Components with async data use `SelfHealingBoundary`
- [ ] Top-level app wrapped in `ErrorBoundary`
- [ ] `FinancialCalculationError` used for engine failures with input fingerprinting
- [ ] No empty catch blocks anywhere in the codebase

## Key Files

| File | Purpose |
|------|---------|
| `server/routes/helpers.ts` | `logAndSendError`, `sendError`, `logActivity` |
| `client/src/components/ErrorBoundary.tsx` | Three error boundary components |
| `shared/errors.ts` | `FinancialCalculationError` class |
| `client/src/lib/sentry.ts` | Sentry initialization and helpers |
