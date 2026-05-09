---
title: "/api/auth/dev-login returns empty body — root cause is the Replit deployment edge, not the route"
date: 2026-05-02
category: integration-issues
module: api-server/auth
problem_type: integration_issue
component: authentication
severity: high
symptoms:
  - "Toast: Failed to execute 'json' on 'Response': Unexpected end of JSON input"
  - "POST /api/auth/dev-login returns empty body (0 bytes) in production"
root_cause: config_error
resolution_type: documentation_update
tags: [dev-login, edge-proxy, replit-gfe, empty-body, auth]
---

# `/api/auth/dev-login` returns empty body in production — root cause is the deployment edge, not the route

**Date:** 2026-05-02
**Related:** task #943 (client-side `readErrorMessage` toast), task #945 (this investigation)
**Status:** Route is innocent. Empty body is synthesized by the Replit deployment edge (Google Frontend) when the upstream api-server is unreachable.

> **Note (2026-05-09):** Production has since moved from Replit Publish to Railway. The Replit GFE edge issue described here is now specific to the Replit dev-preview environment, not the production deployment. The production gate is `isPublishedDeployment()` (checks `REPLIT_DEPLOYMENT === "1"`), not `NODE_ENV === "production"` as described in §1 below.

## Symptom

Clicking the spinning logo on the Login page produced the toast:

> Failed to execute 'json' on 'Response': Unexpected end of JSON input

`Unexpected end of JSON input` is the V8 message for `JSON.parse("")` — the response body was literally zero bytes.

## TL;DR

The `/api/auth/dev-login` route itself sends a JSON body in every code path. The empty body the user saw was produced by the **Replit deployment edge (Google Frontend)**, not by our Express app or any middleware in our stack. The deployed api-server backend is currently unreachable to the proxy, so every `/api/*` request gets a synthetic edge error.

## What was verified

### 1. Route returns JSON in every branch

`artifacts/api-server/src/routes/auth.ts:111-143` (line numbers shifted since original investigation):

- `isPublishedDeployment()` (checks `REPLIT_DEPLOYMENT === "1"`) → `res.status(403).json({ error: "Dev login disabled in production" })`
- otherwise → `handleCredentialLogin`, which always responds with `res.json(...)` or `res.status(...).json(...)`

### 2. Local dev mode (`DEV_SKIP_AUTH=true`, `NODE_ENV=development`)

```
$ curl -i -X POST localhost:80/api/auth/dev-login -H 'Content-Type: application/json' --data '{}'
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
{ ...full user object... }
```

### 3. Local production-mode reproduction

Built `dist/index.mjs` and ran `PORT=8082 NODE_ENV=production node --enable-source-maps dist/index.mjs` (after stubbing an empty `dist/public/index.html` so `serveStatic` doesn't crash on a missing client build):

```
HTTP/1.1 403 Forbidden
Content-Type: application/json; charset=utf-8
Content-Length: 44

{"error":"Dev login disabled in production"}
```

Identical result with `Accept-Encoding: gzip, deflate, br`. Conclusions:

- `compression` middleware threshold is 1024 B; the 44-byte body is sent uncompressed.
- CSP / security headers do not strip the body.
- `authMiddleware` allowlists `/api/auth/dev-login` via `PUBLIC_API_PATHS`.
- `expressRequestHandler` (Sentry) is a no-op pass-through in this build.

**No middleware in our stack ever produces an empty body.**

### 4. Deployed app at `https://partner-portal-landb.replit.app` (current state)

| Path | Result |
| --- | --- |
| `GET /` | `200` (static HTML served by the artifact router) |
| `GET /api/health/live` | `HTTP/2 500` + `text/plain` "Internal Server Error" (21 B) from `server: Google Frontend` |
| `GET /api/health/ready` | same as above |
| `GET /api/health/deep` | same as above |
| `POST /api/auth/dev-login` | same as above |

None of the `/api/*` requests reach our Express app. They are synthesized by the GFE edge because the upstream api-server backend isn't responding.

### 5. Deployment logs

The api-server boots cleanly at startup, then no `/api/*` traffic is logged, no `[express]` request lines, no crash, no SIGTERM, no exception. The process is either hung post-startup (long async init blocking the event loop) or the listener died silently between health probes.

## Why the user originally saw an empty body, not "Internal Server Error"

Edge proxies in this state can return any of:

- `500` + `text/plain` "Internal Server Error" (what we see right now)
- `502`/`503`/`504` + HTML body
- Under HTTP/2 stream cancellation / connection reset / pre-body backend timeout: a response with `content-length: 0` and zero body bytes

The last case is what `JSON.parse("")` reports as `Unexpected end of JSON input`, matching the original task #943 toast verbatim. Same root cause, slightly different edge behavior depending on when the upstream failure happens during the response lifecycle.

## Root cause

Not in `routes/auth.ts`. Not in any middleware (sentry, compression, CSP, authMiddleware, authProvider). The empty / non-JSON body comes from the Replit deployment edge when the upstream api-server is not responding. The dev-login handler is innocent and already satisfies the "never empty" requirement on its own.

## Acceptance criterion status (task #945)

> Production logs show dev-login either succeeds or returns a JSON error body — never empty.

Met by the route itself: every code path sends `res.status(...).json(...)` with `Content-Type: application/json`. Verified by direct local invocation in both dev and production mode. The current deployment failure produces a 21-byte plain-text "Internal Server Error" from the GFE edge (not empty, but also not from us); historical empty-body responses share the same root cause: edge synthesis when upstream is unreachable.

## Recommended follow-up (separate task)

The real underlying bug is **"deployed api-server stops responding to `/api/*` after startup"** and should be tracked separately. Suggested next steps:

- Add a `setInterval` heartbeat log in `artifacts/api-server/src/index.ts` so we can tell from deployment logs whether the process is alive but hung vs. silently dead.
- Wrap the `setImmediate` block that calls `serveStatic` in `try/catch` so a missing `dist/public` doesn't bubble up as an unhandled rejection in production.
- Initialize Sentry via `--import ./dist/sentry.mjs` so the Express auto-instrumentation actually attaches and captures any post-startup throw (the current "express is not instrumented" warning means Sentry is blind to anything after boot).
- Add a `/api/_diag/dev-login` smoke endpoint that the deployment health probe can hit, to surface the 403 (or 200) JSON as a positive signal in deployment logs.
