---
title: "SSE-consuming React components must clean up accumulated state on abort, error, and retry"
date: 2026-05-08
category: architecture-patterns
module: sse-streaming-component
problem_type: architecture_pattern
component: frontend
severity: high
applies_when:
  - Writing a React component that opens an SSE or streaming-fetch connection
  - The component accumulates per-event state (Maps keyed by event ID, arrays appended per event)
  - The component has an abort mechanism (AbortController, user-initiated cancel)
  - The component has an error-recovery path that retries the same logical stream
  - The component polls a server endpoint that uses a recency window before resetting phase state
tags:
  - sse-streaming
  - react-lifecycle
  - ref-cleanup
  - stream-abort
  - state-synchronization
  - react-query
  - polling
---

# SSE-consuming React components must clean up accumulated state on abort, error, and retry

## Context

A code review of `RebeccaPanel.tsx` and `SpecialistsDirectoryPage.tsx` uncovered four related
bugs, all caused by the same lifecycle gap: React components that consume SSE streams accumulate
state across events (timing refs, step arrays) but none of that state was cleaned up when the
stream ended abnormally. The bugs only surfaced after multiple user interactions in a live
session — they were invisible in unit tests.

The common anti-pattern is one-sided cleanup: the happy-path exit (`event === "done"`,
`tool_done` event) cleans up state, but abort, error, and retry paths do not. Over time,
accumulated state leaks across interactions.

## Guidance

### Rule 1 — Clear timing refs unconditionally in `finally`

Any `useRef<Map<…>>` that accumulates per-event entries must be cleared in the `finally` block,
not only on the events that would ordinarily clean each entry. The `finally` block fires on every
exit path — clean completion, abort, error, and retry.

```tsx
// CORRECT
} finally {
  toolStartTimesRef.current.clear();   // fires on every exit path
  setIsStreaming(false);
  streamingIdRef.current = null;
}
```

**Anti-pattern:** clearing the ref only on `tool_done` events or only on explicit abort — both
leave orphaned entries on error paths and early terminations.

### Rule 2 — Reset accumulated arrays before retry

When an SSE error triggers a retry (same message ID, new stream connection), clear the
accumulated step array *before* calling the retry function. The new stream opens with fresh
tool-call IDs; appending to the leftover array produces phantom duplicate rows.

```tsx
// On server-sent `event: error` → before calling runStream(1):
toolStartTimesRef.current.clear();
setMessages((prev) =>
  prev.map((m) =>
    m.id === streamId ? { ...m, content: "", toolSteps: [] } : m
  )
);
await runStream(1);
```

**The invariant:** `toolSteps` and `toolStartTimesRef` must be emptied together. Clearing one
without the other produces incorrect elapsed-time calculations or stale orbs on the retry.

### Rule 3 — Transition dispatching steps to "error" on abort

When the user aborts mid-stream, steps that received `tool_start` but not `tool_done` have
`phase: "dispatching"`. The corresponding `tool_done` events never arrive, so without an explicit
transition the UI shows permanently-spinning persona orbs.

Catch the `AbortError` and map those steps to `phase: "error"`:

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
                s.phase === "dispatching"
                  ? { ...s, phase: "error" as const }
                  : s
              ),
            }
          : m
      )
  );
}
```

### Rule 4 — Schedule a deferred refetch when polling stops at a terminal server phase

When a server endpoint uses a recency window (returns `phase: "complete"` or `phase: "error"`
for N seconds before resetting to `null`), a `refetchInterval` that returns `false` at terminal
phases freezes the UI permanently at that phase — the client stops asking before the server
resets.

Fix: add a `useEffect` that schedules one deferred refetch after the server's window expires.

```tsx
// WRONG — freezes the orb at terminal phase indefinitely
refetchInterval: (query) =>
  query.state.data?.isRunning ? POLL_INTERVAL_MS : false,

// CORRECT — schedule one deferred refetch after the server's recency window
const { data: runStatus, refetch } = useQuery<SpecialistRunStatus>({ ... });

useEffect(() => {
  if (runStatus?.phase !== "complete" && runStatus?.phase !== "error") return;
  const timerId = setTimeout(
    () => void refetch(),
    SERVER_RECENCY_WINDOW_MS + 500   // RECENT_RUN_THRESHOLD_MS + buffer
  );
  return () => clearTimeout(timerId);
}, [runStatus?.phase, refetch]);
```

## Why This Matters

All four bugs are invisible in snapshot tests and only surface after multiple user interactions:

- **Timing ref leak (Bug 1):** After many abort cycles, `toolStartTimesRef.current` grows
  unboundedly, consuming memory and eventually producing incorrect elapsed-time values if IDs
  happen to collide in a long session.
- **Stale toolSteps on retry (Bug 2):** The UI renders duplicate tool-step rows — the same tool
  names appear twice, once from the failed attempt and once from the retry. Users see confusing
  phantom output below the retried response.
- **Frozen dispatching orb (Bug 3):** After the user clicks "Move on," one or more persona orbs
  spin indefinitely with no elapsed time, making the UI appear broken even though the stream is
  gone.
- **Frozen terminal orb (Bug 4):** A SpecialistOrb freezes at "complete" or "error" for the
  lifetime of the page because the server's recency-window reset is never observed. The fix is
  ~10 lines; finding the root cause requires knowing that the server has a time-bounded phase
  signal.

These failure modes all stem from the same root cause: accumulated state was only cleaned up on
the happy path. SSE-consuming components need symmetrical cleanup on every exit path.

## When to Apply

- Writing any component that opens an SSE connection via `fetch` + `ReadableStream`
- The component tracks in-flight work with a `useRef<Map<string, …>>` or similar accumulator
- The component has user-initiated abort (AbortController)
- The component retries a stream on server-sent error events
- The component polls a server endpoint that resets phase state after a fixed recency window

## Examples

### Before — asymmetric cleanup (all four bugs present)

```tsx
// Bug 1: ref only cleaned up in the happy path
if (currentEvent === "tool_done") {
  const id = typeof data.id === "string" ? data.id : String(data.id);
  toolStartTimesRef.current.delete(id);   // only fires on tool_done
}

// Bug 2: toolSteps not cleared before retry
} else if (currentEvent === "error") {
  if (retryCount === 0) {
    setMessages((prev) => prev.map((m) =>
      m.id === streamId ? { ...m, content: "Let me try that again…" } : m
    ));
    await new Promise((r) => setTimeout(r, 600));
    setMessages((prev) => prev.map((m) =>
      m.id === streamId ? { ...m, content: "" } : m   // toolSteps still present
    ));
    await runStream(1);   // retry appends to stale toolSteps
  }
}

// Bug 3: AbortError catch does not transition dispatching steps
} catch (err) {
  if (err instanceof DOMException && err.name === "AbortError") {
    setMessages((prev) => prev.filter((m) => m.id !== streamId || m.content.length > 0));
    // dispatching steps left spinning forever
  }
}

// Bug 4: refetchInterval stops at terminal phase; server reset never observed
refetchInterval: (query) =>
  query.state.data?.isRunning ? SPECIALIST_STATUS_POLL_INTERVAL_MS : false,
```

### After — symmetric cleanup on every exit path

```tsx
// Abort path: clear ref + transition dispatching steps to error
} catch (err) {
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
                  s.phase === "dispatching"
                    ? { ...s, phase: "error" as const }
                    : s
                ),
              }
            : m
        )
    );
  }
} finally {
  toolStartTimesRef.current.clear();   // unconditional — fires on all exit paths
  setIsStreaming(false);
}

// Error path: clear ref + reset toolSteps before retry
toolStartTimesRef.current.clear();
setMessages((prev) =>
  prev.map((m) =>
    m.id === streamId ? { ...m, content: "", toolSteps: [] } : m
  )
);
await runStream(1);

// Polling: deferred refetch after server recency window expires
useEffect(() => {
  if (runStatus?.phase !== "complete" && runStatus?.phase !== "error") return;
  const timerId = setTimeout(
    () => void refetchRunStatus(),
    SPECIALIST_STATUS_POLL_INTERVAL_MS + 500
  );
  return () => clearTimeout(timerId);
}, [runStatus?.phase, refetchRunStatus]);
```

## Related

- `artifacts/hospitality-business-portal/src/components/rebecca/RebeccaPanel.tsx` — all four fixes applied here
- `artifacts/hospitality-business-portal/src/pages/intelligence/SpecialistsDirectoryPage.tsx` — Bug 4 fix applied here
- `.agents/skills/sse-streaming-discipline/SKILL.md` — 5-rule checklist synthesised from these bugs
- `.agents/skills/cross-check-invariants/SKILL.md` — H+-specific pairs table: SSE event-type symmetry row
