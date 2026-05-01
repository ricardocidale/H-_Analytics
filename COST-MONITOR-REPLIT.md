# Cost Monitor — Replit Instrumentation Plan

> **Scope clarification (Apr 20, 2026):** This file tracks **our app's outbound API costs** (Gemini / Anthropic / OpenAI / Perplexity calls our server makes). For **Replit's invoicing of us** (the 75 Replit invoices, $4,747.69 project-life), see the live DB tables `replit_invoices` + `replit_invoice_line_items`, the seeder `script/seed-replit-billing.ts`, the report `docs/billing/hplus-cost-report.md`, and the forensic source `rewritetax.md`.

## Status: COMPLETE (March 17, 2026)

All 10 files instrumented. Verified with live chat call — log entry written to `logs/api-costs.jsonl`.
View with: `npm run cost-monitor -- --log logs/api-costs.jsonl`

## Context

Claude Code has already built two files:
- `server/middleware/cost-logger.ts` — exports `logApiCost(entry)` and `estimateCost(service, model, inputTokens, outputTokens)`
- `script/cost-monitor.ts` — CLI dashboard that tails the log file

Your job: **add `logApiCost()` calls to the 10 server route files** that make external API calls. Each call should be added AFTER the API response is received (not before), inside the existing try/catch blocks.

## Import Pattern

At the top of each file, add:
```typescript
import { logApiCost, estimateCost } from "../middleware/cost-logger";
```
(Adjust relative path based on file depth.)

## Instrumentation Sites

### 1. `server/routes/chat.ts` — Gemini/Perplexity chat
After the AI response is received, add:
```typescript
logApiCost({
  timestamp: new Date().toISOString(),
  service: "gemini",  // or "perplexity" based on which client was used
  model: modelName,   // extract from the config or response
  operation: "chat",
  inputTokens: Math.round(userMessage.length / 4),  // estimate for Gemini
  outputTokens: Math.round(responseText.length / 4),
  estimatedCostUsd: estimateCost("gemini", modelName, Math.round(userMessage.length / 4), Math.round(responseText.length / 4)),
  durationMs: Date.now() - startTime,  // add `const startTime = Date.now();` before the API call
  userId: req.user?.id,
  route: "/api/chat",
});
```
**WARNING:** Read the file first. Find where the AI response text is available. Add `const startTime = Date.now();` just before the API call.

### 2. `server/routes/research.ts` — Anthropic research generation
After `generateResearchWithToolsStream()` completes:
```typescript
logApiCost({
  timestamp: new Date().toISOString(),
  service: "anthropic",
  model: "claude-sonnet-4-20250514",  // or extract from config
  operation: "research",
  inputTokens: response?.usage?.input_tokens,   // Anthropic SDK provides this
  outputTokens: response?.usage?.output_tokens,
  estimatedCostUsd: estimateCost("anthropic", "claude-sonnet-4-20250514", response?.usage?.input_tokens ?? 0, response?.usage?.output_tokens ?? 0),
  durationMs: Date.now() - startTime,
  userId: req.user?.id,
  route: "/api/research/generate",
});
```
**WARNING:** This is a streaming endpoint. The usage data may only be available after the stream completes. Check if the stream callback or final response object has `.usage`. If not, estimate from content length.

### 3. `server/routes/ai.ts` — Various AI completions
After each AI completion call:
```typescript
logApiCost({
  timestamp: new Date().toISOString(),
  service: "anthropic",  // or "openai" — check which client is used
  model: modelUsed,
  operation: "ai-completion",
  inputTokens: response?.usage?.input_tokens ?? response?.usage?.prompt_tokens,
  outputTokens: response?.usage?.output_tokens ?? response?.usage?.completion_tokens,
  estimatedCostUsd: estimateCost(service, model, inputTokens, outputTokens),
  durationMs: Date.now() - startTime,
  userId: req.user?.id,
  route: req.path,
});
```

### 4. `server/routes/icp-research.ts` — ICP analysis (Anthropic)
Same pattern as research.ts but with `operation: "icp-research"`.

### 5. `server/routes/calculations.ts` — OpenAI calculations
After OpenAI response:
```typescript
logApiCost({
  timestamp: new Date().toISOString(),
  service: "openai",
  model: response.model,
  operation: "calculation",
  inputTokens: response.usage?.prompt_tokens,
  outputTokens: response.usage?.completion_tokens,
  estimatedCostUsd: estimateCost("openai", response.model, response.usage?.prompt_tokens ?? 0, response.usage?.completion_tokens ?? 0),
  durationMs: Date.now() - startTime,
  userId: req.user?.id,
  route: "/api/calculations",
});
```

### 6. `server/routes/premium-exports.ts` — Gemini image generation
After image generation completes:
```typescript
logApiCost({
  timestamp: new Date().toISOString(),
  service: "gemini",
  model: "gemini-2.5-flash-image",
  operation: "image-gen",
  estimatedCostUsd: 0.02,  // flat estimate per image
  durationMs: Date.now() - startTime,
  userId: req.user?.id,
  route: "/api/premium-exports",
});
```

### 7. `server/integrations/resend.ts` — Email
After email send:
```typescript
logApiCost({
  timestamp: new Date().toISOString(),
  service: "resend",
  operation: "email",
  estimatedCostUsd: 0.001,
  route: "resend-integration",
});
```

### 9. `server/integrations/document-ai.ts` — Document parsing
After document parse completes:
```typescript
logApiCost({
  timestamp: new Date().toISOString(),
  service: "document-ai",
  operation: "document-parse",
  estimatedCostUsd: 0.01 * pageCount,  // $0.01 per page
  route: "document-ai-integration",
});
```

### 10. `server/replit_integrations/image/routes.ts` — Image generation
After image generation:
```typescript
logApiCost({
  timestamp: new Date().toISOString(),
  service: "replicate",  // or "gemini" — check which is used
  model: modelUsed,
  operation: "image-gen",
  estimatedCostUsd: 0.01,  // per image
  route: "/api/image",
});
```

## General Rules

1. **Always add `const startTime = Date.now();`** just before each API call
2. **Place `logApiCost()` inside the existing try/catch** — after the response, before sending to client
3. **Never let logging crash the route** — wrap in try/catch if needed:
   ```typescript
   try { logApiCost({...}); } catch {}  // fire-and-forget
   ```
4. **Use the actual variable names** from the existing code — read each file first to find the response variable name, model config, etc.

## Verification

1. Start the server: `npm run dev`
2. Open the app and trigger a chat message
3. Check: `cat logs/api-costs.jsonl` — should have one line
4. In another terminal: `npm run cost-monitor` — should show the call
5. Trigger a research generation — verify Anthropic token counts appear
