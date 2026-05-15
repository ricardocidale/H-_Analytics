## Summary

<!-- What changed and why (one short paragraph). -->

## Reviewer notes

- **Onboarding / product context:** `README.md` (repo root)
- **Repo contracts and AI workflow:** `CLAUDE.md` (repo root)
- If this PR edits **README.md** or **CLAUDE.md**, read those diffs first so shared guidance stays accurate.

## Checklist (author)

- [ ] No secrets committed (`.env` stays local; only `.env.example` updated if new vars are required)
- [ ] Prisma schema changes include a **migration** under `prisma/migrations/`
- [ ] New or changed HTTP behavior is reflected in **README.md** (API table) when user-visible
- [ ] Tested locally: `npm run build` and/or `npm run dev` as appropriate
