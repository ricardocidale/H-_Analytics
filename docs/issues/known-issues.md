# Known Issues

> Extracted from CLAUDE.md on 2026-05-07. See CLAUDE.md § Architecture Notes for the pointer.

- **Email-existence leak** at `POST /api/scenarios/shares` — returns 404 "No user found with that email address", leaking whether an email exists. Should return a generic 404.
- **Iris agent `temperature + top_p` conflict.** `POST /api/admin/iris/run` triggers the run successfully but the Iris LLM call fails with `"temperature and top_p cannot both be specified for this model"`. The `iris_runs` table is healthy; the fix is in the Iris agent's LLM call parameters (remove one of the two conflicting params).
- `PROJECTION_YEARS` is exported from `lib/shared/src/constants.ts` as an alias of `DEFAULT_PROJECTION_YEARS`.
