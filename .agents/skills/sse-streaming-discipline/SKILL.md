---
name: sse-streaming-discipline
description: "Discipline checklist for React components that consume SSE streams. Use when building or modifying any component that reads a streaming endpoint via fetch + ReadableStream, including RebeccaPanel and any future streaming chat or agent panels. Prevents the recurring bugs: refs not cleared on abort, step state not reset on retry, and polling that stops before the server's recency window expires."
---

# SSE Streaming Component Discipline

Patterns for React components that consume SSE streams via `fetch` + `ReadableStream`. Every rule here was learned from a real production bug in this repo.

## When to use

Apply this checklist when:
- Building or modifying a React component that reads a streaming endpoint (any component with `reader.read()` in a loop)
- Adding new state that is updated by SSE events (new step arrays, timing refs, phase maps)
- Adding new abort or retry paths to an existing streaming component

## The five rules

### Rule 1 — Clear all refs and derived state in the `finally` block

The `finally` block of `sendMessage` (or equivalent) runs on every exit path: normal completion, abort, error, retry exhausted. It is the only guaranteed cleanup site.

Any `useRef` that accumulates entries during streaming must be cleared here.

```tsx
} finally {
  toolStartTimesRef.current.clear();   // ← accumulated timing entries
  setIsStreaming(false);
  setLoading(false);
  streamingIdRef.current = null;
}
```

**Anti-pattern:** clearing the ref only on successful completion (`event === "done"`) or only on explicit abort. Both leave orphaned entries on error paths and early terminations.

### Rule 2 — Transition in-flight steps to a terminal phase on abort

When the user aborts (clicks "Move on"), any steps that received `tool_start` but not `tool_done` will have `phase: "dispatching"` indefinitely. The abort handler must transition them to `"error"` before preserving the partial message.

```tsx
if (err instanceof DOMException && err.name === "AbortError") {
  toolStartTimesRef.current.clear();
  setMessages((prev) =>
    prev
      .filter((m) => m.id !== streamId || m.content.length > 0)
      .map((m) =>
        m.id === streamId
          ? {
              ...m,
              toolSteps: (m.toolSteps ?? []).map((s) =>
                s.phase === "dispatching" ? { ...s, phase: "error" as const } : s
              ),
            }
          : m
      )
  );
}
```

**Why:** a spinning persona orb with no elapsed time reads as a hang to users. Terminal phase is visually resolved; spinning is not.

### Rule 3 — Reset accumulated step state before a retry

On SSE error → retry, the message ID stays the same but a new SSE connection opens with fresh tool-call IDs. New `tool_start` events append to `m.toolSteps` on top of whatever accumulated in attempt 1. The result is duplicate step rows (one per attempt) with the same tool names.

Clear both the step array and the timing ref at the same moment you reset `m.content`:

```tsx
// In the error event handler, before calling runStream(1):
toolStartTimesRef.current.clear();
setMessages((prev) =>
  prev.map((m) =>
    m.id === streamId ? { ...m, content: "", toolSteps: [] } : m
  )
);
await runStream(1);
```

**The invariant:** `m.toolSteps` and `toolStartTimesRef` must be emptied together. If one is cleared without the other, timing calculations produce wrong elapsed times or stale orbs on the retry attempt.

### Rule 4 — Schedule a deferred refetch when polling stops at a terminal state

A `useQuery` with `refetchInterval: (q) => q.state.data?.isRunning ? INTERVAL : false` stops polling the moment a run completes. But if the server has a **recency window** (e.g., a 30-second window during which it returns `phase: "complete"` before resetting to `null`), the client will miss the reset — the orb freezes in "complete" or "error" forever.

Fix: schedule one deferred refetch after the server window expires.

```tsx
const { data: runStatus, refetch } = useQuery<SpecialistRunStatus>({ ... });

useEffect(() => {
  if (runStatus?.phase !== "complete" && runStatus?.phase !== "error") return;
  const timerId = setTimeout(() => void refetch(), SERVER_WINDOW_MS + 500);
  return () => clearTimeout(timerId);
}, [runStatus?.phase, refetch]);
```

**Where the server window lives:** `RECENT_RUN_THRESHOLD_MS` in `catalog.ts`. Pass the same value (or a named import) as the timeout. The +500ms buffer gives the server time to process the transition before the client asks again.

### Rule 5 — New SSE event types must be handled in the client handler

The server's SSE stream in `chat.ts` emits named events. The client handler in `RebeccaPanel.tsx` has a chain of `currentEvent === "..."` comparisons. Adding a new event type server-side without a matching client branch means the event silently falls through.

When adding a new SSE event:
1. Add the server-side `sseWrite(res, "event_name", payload)` call
2. Add the client-side `else if (currentEvent === "event_name")` branch in the same PR
3. Update the cross-check-invariants checklist (the event-type row)

**Guard against ended responses:** `sseWrite` already has a `res.writableEnded` guard. Do not remove it.

## Checklist (run before closing any streaming component task)

- [ ] Does any `useRef` that grows during streaming get `.clear()`-ed in the `finally` block?
- [ ] Does the abort catch branch transition `phase: "dispatching"` steps to `phase: "error"`?
- [ ] Does the retry path clear `toolSteps` and the timing ref before opening a new stream?
- [ ] Does any polling query that stops at a terminal state schedule a deferred refetch to catch the server's recency window reset?
- [ ] Are all new SSE event types handled in both the server emitter and the client handler?

## Related skills

- `cross-check-invariants` — the H+-specific pairs table covers the SSE event-type invariant and the `callLlm` provider-symmetry invariant
- `parity-audit` — run when adding any new SSE-backed capability to confirm Rebecca has a matching tool
