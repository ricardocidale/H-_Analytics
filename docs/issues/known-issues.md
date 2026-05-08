# Known Issues

> Extracted from CLAUDE.md on 2026-05-07. See CLAUDE.md § Architecture Notes for the pointer.

- **Email-existence leak** at `POST /api/scenarios/shares` — returns 404 "No user found with that email address", leaking whether an email exists. Should return a generic 404.
- `PROJECTION_YEARS` is exported from `lib/shared/src/constants.ts` as an alias of `DEFAULT_PROJECTION_YEARS`.
