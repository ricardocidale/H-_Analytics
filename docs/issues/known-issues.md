# Known Issues

> Extracted from CLAUDE.md on 2026-05-07. See CLAUDE.md § Architecture Notes for the pointer.
> Last reviewed: 2026-05-09 — all previously tracked issues resolved.

- ~~**Email-existence leak** at `POST /api/scenarios/shares`~~ — Fixed (`657326f6`): returns `201`
  with `{ shares: [], recipientName: null }` for unrecognised emails, identical in status and
  shape to a zero-new-shares success response.
- ~~`PROJECTION_YEARS` exported as alias of `DEFAULT_PROJECTION_YEARS`~~ — Fixed (`8176c58b`):
  alias removed from `lib/shared/src/constants.ts`; callers updated to `DEFAULT_PROJECTION_YEARS`.

## Recurring class: dangling `setTimeout`-based timeout promises crash Node 20

**Symptom.** Container boots normally, then ~120s after an early failure (e.g.
invalid `ANTHROPIC_API_KEY` in a Railway PR-preview env) it crashes with:

```
Error: Chat LLM timed out after 120s
    at Timeout._onTimeout (.../routes/chat.ts:156)
```

Railway reports the deploy as "Build Failed" because the healthcheck never
stabilises across the restart loop.

**Root cause.** `callLlm()` in `artifacts/api-server/src/routes/chat.ts`
constructs a `timeoutP = new Promise((_, reject) => setTimeout(reject, ...))`
at the top of the function, then races it against the provider call. If the
provider call throws **synchronously** before `Promise.race` is reached
(e.g. `getAnthropicClient()` failing on a missing/bad key), `timeoutP` is
left dangling with no handlers attached. 120s later the timer fires, the
rejection is unhandled, and Node 20's default `--unhandled-rejections=throw`
kills the process.

**Fix pattern (apply anywhere a `setTimeout`-based timeout promise is used).**
1. Save the timer handle and `clearTimeout()` it in a `finally` block so the
   event loop isn't kept alive after the LLM returns.
2. Attach a no-op `.catch()` to the timeout promise immediately after creation
   so the rejection is always handled even if `Promise.race` is never reached.
3. Wrap the provider branches in `try { ... } finally { clearLlmTimeout(); }`.

Fixed in `chat.ts` (Task #1215). Search for other `new Promise((_, reject) =>
setTimeout(reject` patterns and apply the same belt-and-suspenders treatment.
