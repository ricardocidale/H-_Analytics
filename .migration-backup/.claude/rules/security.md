# Security Baseline

## Rule

Every API endpoint must enforce authentication and authorization. User input must be validated before processing. Sensitive data must never be exposed in logs, responses, or client bundles.

## Authentication

All `/api/` routes except `/api/auth/login` and `/api/auth/register` require authentication. The `requireAuth` middleware must be applied:

```typescript
// CORRECT — protected route
router.get("/api/properties", requireAuth, async (req, res) => { ... });

// WRONG — no auth check
router.get("/api/properties", async (req, res) => { ... });
```

Admin-only routes must additionally check `req.user.role === "admin"`:

```typescript
router.post("/api/admin/seed-production", requireAuth, requireAdmin, async (req, res) => { ... });
```

## Input Validation

All request bodies must be validated with Zod schemas before processing. Never trust client-provided data:

```typescript
// CORRECT — validate with schema
const parsed = insertPropertySchema.safeParse(req.body);
if (!parsed.success) return res.status(400).json({ error: parsed.error });

// WRONG — trust raw body
const property = req.body;
await storage.createProperty(property);
```

## Secrets & Credentials

- All API keys, passwords, and tokens must come from environment variables — never hardcoded
- Never log full API keys, tokens, or connection strings — log at most the last 4 characters
- Never include secrets in client-side bundles or API responses
- Password hashing uses bcrypt with appropriate salt rounds

## SQL Injection Prevention

- All database access goes through Drizzle ORM (parameterized queries by default)
- Raw SQL (`sql\`...\``) must use Drizzle's parameter binding, never string concatenation
- No route may import `db` directly — all access through `IStorage` facade

## Rate Limiting & Resource Protection

- AI-powered endpoints (research, chat, voice) should have reasonable rate limits
- File upload endpoints must validate file type and enforce size limits
- Long-running operations (exports, research) should have timeouts

## Prohibited

- Hardcoded API keys, passwords, or secrets anywhere in source code
- `eval()`, `Function()` constructor, or dynamic code execution with user input
- Serving sensitive files (`.env`, database backups, config files) via static routes
- CORS wildcards (`*`) on authenticated endpoints
