---
title: "OpenAI SDK inherits OPENAI_BASE_URL from environment, breaking embeddings on Replit"
date: "2026-05-02"
category: docs/solutions/integration-issues
module: api-server
problem_type: integration_issue
component: assistant
severity: critical
symptoms:
  - "knowledge-base pgvector namespace stays at 0 rows after every server restart"
  - "OpenAI SDK returns 400 — Endpoint POST /embeddings is not supported"
  - "Startup log says 'Vector store + embeddings: ready' but embeddings silently fail"
  - "Benchmark indexing reports 'N upserted' even though embedding calls fail (error swallowed by try/catch)"
root_cause: config_error
resolution_type: code_fix
related_components:
  - vector-store-service
  - knowledge-base
  - vector-indexing
tags:
  - openai-sdk
  - replit-ai-proxy
  - pgvector
  - embeddings
  - environment-variables
  - base-url
---

# OpenAI SDK inherits OPENAI_BASE_URL from environment, breaking embeddings on Replit

## Problem

The knowledge-base pgvector namespace remained permanently empty (0 rows) because all embedding
calls were being routed to the Replit AI integration proxy instead of `api.openai.com`. The
Replit proxy does not support the `/embeddings` endpoint and returns a 400 error. This failure
was completely invisible: startup logs declared the system "ready," and benchmark indexing
reported successful upserts — both were misleading.

## Symptoms

- `knowledge-base` namespace has 0 rows in `vector_chunks` after every restart
- Server log shows `400 Endpoint: 'POST /embeddings' is not supported`
- Startup emits `Vector store (pgvector) + embeddings: ready (knowledge learning active)` despite broken embeddings
- Benchmark scheduler reports "N benchmarks upserted" — outer scheduling log, not proof of embedding success
- `queryChunks("knowledge-base", ...)` always returns empty results; Rebecca has no KB context

## What Didn't Work

- **Fixing `knowledge-base.ts` to import `embed`/`embedBatch` from `vector-store-service` instead of `getOpenAIClient` from `clients.ts`**: Correct direction — the chat client was wrong for embeddings — but the underlying embedding client itself still inherited the proxy base URL, so the 400 persisted.
- **Treating "27 benchmarks upserted" as proof that `embed()` worked**: The benchmark indexing wraps each `upsertChunks()` call in a `try/catch` that swallows failures and logs "upserted" regardless. This was a red herring.
- **Checking that `OPENAI_EMBEDDING_KEY` was set**: The key was correct; the problem was not the key but the base URL the SDK resolved independently of the key.

## Solution

In `artifacts/api-server/src/ai/vector-store-service.ts`, explicitly pass `baseURL` in the
`OpenAI` constructor so the SDK cannot inherit `OPENAI_BASE_URL` from the environment:

**Before:**
```typescript
function getEmbeddingClient(): OpenAI | null {
  // ...
  const directKey = process.env.OPENAI_EMBEDDING_KEY || process.env.OPENAI_API_KEY;
  if (directKey) {
    _embeddingClient = new OpenAI({ apiKey: directKey });
    _embeddingAvailable = true;
    return _embeddingClient;
  }
  // ...
}
```

**After:**
```typescript
function getEmbeddingClient(): OpenAI | null {
  // IMPORTANT: always pass baseURL explicitly to prevent the OpenAI SDK from
  // reading OPENAI_BASE_URL from the environment. On Replit, OPENAI_BASE_URL
  // is set to the AI proxy which does NOT support the /embeddings endpoint
  // (returns 400). We must bypass that proxy for embedding calls.
  const DIRECT_BASE = "https://api.openai.com/v1";

  const directKey = process.env.OPENAI_EMBEDDING_KEY || process.env.OPENAI_API_KEY;
  if (directKey) {
    logger.info(
      `[embedding-client] Using ${process.env.OPENAI_EMBEDDING_KEY ? "OPENAI_EMBEDDING_KEY" : "OPENAI_API_KEY"} → ${DIRECT_BASE}`,
      "vector-store",
    );
    _embeddingClient = new OpenAI({ apiKey: directKey, baseURL: DIRECT_BASE });
    _embeddingAvailable = true;
    return _embeddingClient;
  }
  // ...
}
```

**Verified result:** On first restart after fix, startup log shows:
```
[embedding-client] Using OPENAI_EMBEDDING_KEY → https://api.openai.com/v1
```
And `vector_chunks` table: `knowledge-base | 83 rows` (up from 0).

## Why This Works

The OpenAI Node.js SDK v4+ reads `OPENAI_BASE_URL` from `process.env` during instantiation and
uses it as the base URL even when you pass `{ apiKey }` explicitly — constructor options are
merged with environment defaults, and only an explicit `baseURL` argument wins. On Replit,
`OPENAI_BASE_URL` is automatically set to the Replit AI integration proxy URL. That proxy
handles chat completions but explicitly rejects `/embeddings` with a 400.

By passing `baseURL: "https://api.openai.com/v1"` in the constructor options, the explicit
value takes precedence over the environment variable, routing the request directly to OpenAI.

The two-client architecture in this codebase (`clients.ts` for chat via Replit proxy,
`vector-store-service.ts` for embeddings via direct OpenAI) is correct — the only missing
piece was the explicit `baseURL` override in the embedding client.

> **SDK version note:** This behavior is specific to OpenAI Node SDK v4.x. In v3 and earlier
> (using the `Configuration` class), base URL was not auto-read from the environment.

## Prevention

- **Always pass `baseURL` explicitly when using OpenAI for embeddings on Replit.** Never
  rely on the default base URL resolution when a specific endpoint is required.

- **Add a startup diagnostic log** from `getEmbeddingClient()` that shows the key source and
  resolved base URL. Use `client.baseURL` (a public property on the initialized `OpenAI` instance)
  rather than logging a hardcoded string — it reflects what the SDK actually resolved:
  ```typescript
  logger.info(`[embedding-client] baseURL resolved to: ${_embeddingClient.baseURL}`, "vector-store");
  ```

- **Fail loudly in core indexing utilities.** The `upsertChunks` function wrapping failures
  in `try/catch` without re-throwing causes "successful upsert" logs that mask real failures.
  Either propagate errors or log the actual 400 message at the point of failure.

- **Add a startup embedding probe.** Before declaring the vector store "ready," attempt a
  single test embedding to confirm the client resolves to the correct endpoint.

- **Rule of thumb for Replit environments:** Any service that uses an OpenAI client for a
  non-chat purpose (embeddings, fine-tuning, files) must receive an explicit `baseURL` to
  opt out of the Replit proxy injection.

## Related Issues

- `docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md` — higher-level AI pipeline wiring (same `vector-store-service.ts` area, different problem)
- Fix commit: `a5d390ac fix(vector-store): bypass Replit OPENAI_BASE_URL proxy for embedding client`
