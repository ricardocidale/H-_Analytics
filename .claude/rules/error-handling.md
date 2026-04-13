# Error Handling & Logging

## Rule

All errors must be handled explicitly. No silent failures. Logging must follow consistent format and levels. Users must never see raw error messages, stack traces, or unhandled exceptions.

## Server-Side Logging Format

All server log messages use the structured format: `[LEVEL] [domain] message`

```typescript
// CORRECT
console.error("[db] Unexpected pool error", err.message);
console.info("[INFO] [express] GET /api/properties 200 in 12ms");
console.error("[ERROR] [research] Claude API timeout", { propertyId, elapsed });

// WRONG — no domain tag
console.log("something went wrong");
console.error(err);
```

## Log Levels

| Level | Use For |
|-------|---------|
| `[INFO]` | Successful operations, startup, migrations, request logging |
| `[WARN]` | Recoverable issues, deprecation notices, fallback activations |
| `[ERROR]` | Failures that need attention — API errors, DB failures, validation failures |

## Error Handling Patterns

### API Routes

Every route must have try/catch. Return structured error responses, never raw exceptions:

```typescript
// CORRECT
try {
  const result = await storage.getProperty(id);
  if (!result) return res.status(404).json({ error: "Property not found" });
  res.json(result);
} catch (err) {
  console.error("[ERROR] [properties] Failed to fetch property", err);
  res.status(500).json({ error: "Failed to fetch property" });
}

// WRONG — unhandled, leaks internals
const result = await storage.getProperty(id);
res.json(result);
```

### Database Connections

Pool and client errors must have handlers to prevent process crashes:

```typescript
pool.on("error", (err) => {
  console.error("[db] Unexpected pool error", err.message);
});
```

### Frontend Error Boundaries

- Use React error boundaries around major page sections
- Show styled error cards with retry actions (per design-standards rule)
- Never display raw error strings to users
- Log client-side errors with context (component name, action attempted)

### External API Calls (AI, Stripe, etc.)

- Always set timeouts on external API calls
- Implement graceful degradation — if an AI call fails, show a meaningful message, not a blank page
- Log the service name, operation, and error type (not full response bodies with credentials)

## Prohibited

- `console.log(err)` without domain tag or context
- Swallowing errors silently (`catch (e) {}`)
- Exposing internal error details (stack traces, DB connection strings) in API responses
- Unhandled promise rejections in route handlers
