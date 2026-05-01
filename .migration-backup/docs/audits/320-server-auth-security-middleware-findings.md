# Opus Audit #320: Server Auth, Security & Middleware

**Auditor**: Main Agent  
**Date**: 2026-04-10  
**Scope**: Authentication, authorization, session management, cryptography, middleware pipeline, and Express security configuration  
**Files Reviewed**: 13 TypeScript files + 1 JSON config across `server/auth.ts`, `server/routes/auth.ts`, `server/routes/google-auth.ts`, `server/lib/token-encryption.ts`, `server/middleware/`, `server/replit_integrations/auth/`, `server/sentry.ts`, `server/constants.ts`, `server/index.ts`

---

## Executive Summary

**Verdict: PASS** — The server authentication, authorization, and security layer is well-designed and follows industry best practices. Session management uses cryptographically secure random IDs with database-backed persistence. Password hashing uses bcrypt with 12 salt rounds. The authorization model implements proper default-deny with explicit whitelisting. Token encryption uses AES-256-GCM with random IVs. No critical or high-severity findings.

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High     | 0 |
| Medium   | 2 |
| Low      | 4 |

---

## Architecture Inventory

### Authentication Flow
- **Primary**: Cookie-based session auth (`server/auth.ts`)
  - Session ID: 64-hex-char (`crypto.randomBytes(32)`)
  - Cookie: `httpOnly`, `secure` (production), `sameSite: "lax"`, 7-day expiry
  - Sessions stored in database, survive server restarts
  - Expired sessions cleaned hourly
- **Google OAuth**: `server/routes/google-auth.ts`
  - State parameter with 5-minute expiry for CSRF protection
  - ID token verified against audience (GOOGLE_CLIENT_ID)
  - Email verification enforced (`email_verified !== false`)
  - Closed registration: user must already exist in DB to sign in
- **Replit OIDC** (Legacy): `server/replit_integrations/auth/replitAuth.ts`
  - Fully scaffolded but NOT wired into the application
  - `setupAuth()` and `registerAuthRoutes()` are exported but never called from `server/index.ts` or `server/routes.ts`

### Authorization (RBAC)
- **Default-deny** at `server/index.ts:105-110`: all `/api/` routes require auth unless explicitly in `PUBLIC_API_PATHS` or `PUBLIC_API_PREFIXES`
- Four middleware tiers: `requireAuth` → `requireAdmin` / `requireChecker` / `requireManagementAccess`
- Property-level access control via `checkPropertyAccess()`: admin bypass, owner check, user-group membership
- Role hierarchy: admin > checker > user > investor

### Rate Limiting
- **Login rate limiting** (`server/auth.ts`): 5 attempts per IP, 15-minute lockout, in-memory Map with hourly cleanup
- **API rate limiting** (`server/auth.ts`): per-user per-endpoint, 1-minute sliding window
- **AI rate limiting** (`server/middleware/rate-limit.ts`): dedicated middleware with configurable limits (default 20/min), 1-minute self-cleaning interval

### Cryptography
- **Password hashing**: bcrypt with 12 salt rounds (`server/auth.ts`)
- **Token encryption**: AES-256-GCM (`server/lib/token-encryption.ts`)
  - Key derived from `TOKEN_ENCRYPTION_KEY` env var via SHA-256
  - Random 16-byte IV per encryption
  - Auth tag for integrity verification
  - Prefixed output format (`enc:base64`) for migration compatibility

### Security Headers (server/index.ts)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(self), geolocation=()`
- `Content-Security-Policy`: restrictive with explicit `connect-src` for Sentry/PostHog
- `Strict-Transport-Security`: 1 year, includeSubDomains (production only)
- `X-Powered-By`: disabled
- `trust proxy: 1` (correct for Replit reverse proxy)

---

## Findings

### M-001: No CSRF Protection for State-Changing POST/PATCH/DELETE Routes
**Severity**: Medium  
**Location**: `server/index.ts` (middleware pipeline), all `POST/PATCH/DELETE` routes  
**Description**: The application uses `sameSite: "lax"` cookies for session authentication. While `lax` prevents CSRF for simple cross-origin POST requests, it does NOT protect against top-level navigation form submissions (GET-based CSRF) or cross-origin requests from sites that the user navigates to. State-changing operations (`POST /api/auth/login`, `PATCH /api/profile`, `DELETE` routes) rely solely on the cookie presence.  
**Mitigation factors**: (1) `sameSite: "lax"` blocks most cross-origin POST attacks, (2) all mutations use `POST/PATCH/DELETE` (never GET), (3) the CSP `frame-ancestors` restriction prevents iframe-based attacks, (4) the app is behind Replit's reverse proxy which adds additional protections. The residual risk is low but non-zero.  
**Remediation**: Consider adding a CSRF token (e.g., `csurf` or double-submit cookie pattern) for defense-in-depth, especially if the app will be hosted on a custom domain.

### M-002: In-Memory Rate Limiting Not Shared Across Instances
**Severity**: Medium  
**Location**: `server/auth.ts:75`, `server/auth.ts:125`, `server/middleware/rate-limit.ts:8`  
**Description**: Login attempt tracking and API rate limiting use in-memory `Map` objects. If the application scales to multiple instances (e.g., behind a load balancer), rate limits are per-instance and an attacker can spread attempts across instances to bypass the 5-attempt login lockout. Currently mitigated by single-instance deployment on Replit.  
**Remediation**: If multi-instance deployment is planned, migrate to database-backed or Redis-backed rate limiting.

### L-001: `catch (e)` Without Type Annotation
**Severity**: Low  
**Location**: `server/routes/google-auth.ts:133`  
**Description**: One catch block uses `catch (e)` instead of `catch (error: unknown)`. The error is logged as `${e}` which uses toString() and may produce `[object Object]` for non-Error objects. Project convention requires `catch (error: unknown)` with `error instanceof Error ? error.message : String(error)`.  
**Remediation**: Change to `catch (error: unknown)` and use the standard error message extraction pattern.

### L-002: Global Error Handler Uses `err: any`
**Severity**: Low  
**Location**: `server/index.ts:176`, `server/sentry.ts:38-39`  
**Description**: The Express error handler signature uses `(err: any, ...)` which is the standard Express pattern but violates the project's `as any` budget tracking. These three instances are all in error handler positions where Express's type system essentially requires `any`. This is an accepted technical debt.  
**Remediation**: Accepted — Express error handler middleware requires the `(err, req, res, next)` four-argument signature, and the `err` parameter is untyped by design.

### L-003: Replit Auth Scaffold is Dead Code
**Severity**: Low  
**Location**: `server/replit_integrations/auth/` (all 4 files)  
**Description**: The entire Replit OIDC authentication module (`replitAuth.ts`, `routes.ts`, `storage.ts`, `index.ts`) is fully implemented but never imported or called from the application startup path. `setupAuth()` is not called from `server/index.ts`. `registerAuthRoutes()` is not called from `server/routes.ts`. The legacy `shared/auth.ts` schema that this module depends on defines a separate user model with string IDs (vs. the main app's numeric IDs).  
**Remediation**: Remove the dead code or clearly mark it as dormant with a README explaining its purpose.

### L-004: No Timing-Safe Comparison for Session IDs
**Severity**: Low  
**Location**: `server/auth.ts:252` (session lookup via `storage.getSession(sessionId)`)  
**Description**: Session ID lookup is done via database query (`WHERE session_id = ?`), which is timing-safe at the database level (constant-time hash lookup). However, if session validation were ever moved to in-memory comparison, timing attacks could leak valid session IDs. The current implementation is safe.  
**Remediation**: No action needed — database lookups are inherently timing-safe. Document this decision if in-memory session caching is considered in the future.

---

## Verified-Correct Observations

1. **Session ID entropy**: 256-bit random session IDs (`crypto.randomBytes(32)`) — exceeds OWASP minimum of 128 bits.
2. **Password complexity**: Enforces 8+ chars, uppercase, lowercase, digit — meets NIST 800-63B baseline.
3. **bcrypt cost factor**: 12 rounds — appropriate for server-side password hashing (balances security vs. performance).
4. **Default-deny authorization**: All `/api/` routes require authentication unless explicitly whitelisted. The whitelist is narrow (health checks, login, OAuth callbacks, public assets).
5. **OAuth state parameter**: Google OAuth uses `crypto.randomUUID()` with 5-minute expiry and single-use deletion — prevents CSRF and replay attacks on the OAuth flow.
6. **Google ID token audience validation**: `verifyIdToken({ audience: GOOGLE_CLIENT_ID })` — prevents token confusion attacks.
7. **Closed registration**: Users must already exist in the database to sign in via Google — no self-registration, no account enumeration via OAuth.
8. **Error information hiding**: Production error handler returns generic "Internal Server Error" for 5xx responses. Non-production shows error message but never stack traces.
9. **AES-256-GCM**: Correct authenticated encryption for Google OAuth tokens — random IV, auth tag verification, proper key derivation.
10. **Token encryption prefix**: The `enc:` prefix on encrypted tokens enables seamless migration from plaintext to encrypted storage without data loss.
11. **Dev login guard**: `POST /api/auth/dev-login` is blocked in production (`NODE_ENV === "production"` → 403).
12. **Cookie security flags**: `httpOnly` prevents XSS-based cookie theft, `secure` (production) prevents cleartext transmission, `sameSite: "lax"` mitigates most CSRF vectors.
13. **CSP policy**: Restrictive default-src, script-src limited to self + inline (necessary for SPA), frame-ancestors restricted to Replit domains.
14. **HSTS**: 1-year max-age with includeSubDomains in production — proper preload-ready configuration.
15. **Input validation**: Login schemas validated via Zod before processing. Profile updates validated with max lengths. Password change validates complexity.
16. **Graceful shutdown**: SIGTERM/SIGINT handlers close HTTP server, clear intervals, and drain DB pool — prevents connection leaks and data corruption.

---

## Compliance Checks

| Rule | Status | Notes |
|------|--------|-------|
| No `as any` in auth code | PASS | 0 instances in auth.ts, routes/auth.ts, google-auth.ts, token-encryption.ts |
| `catch (error: unknown)` | PARTIAL | 1 violation at google-auth.ts:133 (`catch (e)`) |
| No hardcoded secrets | PASS | All secrets loaded from environment variables |
| No raw Date manipulation | PASS | Session expiry uses `Date.now() + duration` pattern correctly |
| Zod input validation | PASS | All login and profile endpoints validate with Zod schemas |
| Error response hiding | PASS | Production 5xx hides details; 4xx returns safe, specific messages |
| Domain boundary rule | PASS | Auth routes import from `../storage`, not `../db` |

---

## Security Posture Summary

The authentication and authorization layer is **production-quality** with a well-designed defense-in-depth approach:

- **Authentication**: Strong session management, proper password hashing, secure OAuth flow
- **Authorization**: Default-deny with four-tier RBAC and property-level access control
- **Cryptography**: Industry-standard algorithms (bcrypt, AES-256-GCM) with proper key/IV handling
- **Headers**: Comprehensive security headers (CSP, HSTS, X-Content-Type-Options, Permissions-Policy)
- **Input validation**: Consistent Zod validation on all auth endpoints
- **Rate limiting**: Multi-layer rate limiting (login IP-based + API per-user + AI middleware)
- **Error handling**: Production-safe error responses with no information leakage

The two medium findings (CSRF tokens and in-memory rate limits) are mitigated by the current deployment model but should be addressed if the application moves to multi-instance deployment or custom domain hosting.
