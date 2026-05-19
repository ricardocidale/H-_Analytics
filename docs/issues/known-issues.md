# Known Issues

> Extracted from CLAUDE.md on 2026-05-07. See `docs/architecture/architecture-notes.md` § "Known issues to address" for the pointer.
> Last reviewed: 2026-05-09 — all previously tracked issues resolved.

- ~~**Email-existence leak** at `POST /api/scenarios/shares`~~ — Fixed (`657326f6`): returns `201`
  with `{ shares: [], recipientName: null }` for unrecognised emails, identical in status and
  shape to a zero-new-shares success response.
- ~~`PROJECTION_YEARS` exported as alias of `DEFAULT_PROJECTION_YEARS`~~ — Fixed (`8176c58b`):
  alias removed from `lib/shared/src/constants.ts`; callers updated to `DEFAULT_PROJECTION_YEARS`.
- ~~**Dangling `setTimeout` promises crash Node 20**~~ — Fixed (`f75cf16f`, PR #60): all instances
  in `chat.ts` (Task #1215), `research-orchestrator.ts`, and `probes/index.ts` now save the timer
  handle, attach a no-op `.catch()`, and `clearTimeout()` in a `finally` block. No remaining
  patterns found by grep.
