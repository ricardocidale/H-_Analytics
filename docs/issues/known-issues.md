# Known Issues

> Extracted from CLAUDE.md on 2026-05-07. See CLAUDE.md § Architecture Notes for the pointer.
> Last reviewed: 2026-05-09 — all previously tracked issues resolved.

- ~~**Email-existence leak** at `POST /api/scenarios/shares`~~ — Fixed (`657326f6`): returns `201`
  with `{ shares: [], recipientName: null }` for unrecognised emails, identical in status and
  shape to a zero-new-shares success response.
- ~~`PROJECTION_YEARS` exported as alias of `DEFAULT_PROJECTION_YEARS`~~ — Fixed (`8176c58b`):
  alias removed from `lib/shared/src/constants.ts`; callers updated to `DEFAULT_PROJECTION_YEARS`.
