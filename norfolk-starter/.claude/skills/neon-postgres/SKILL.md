---
name: neon-postgres
description: Neon Serverless Postgres — compact repo skill. Use for connection pooling, branches, and where to fetch current docs. Full Neon doc index at neon.com/docs/llms.txt. For this app, Prisma + DATABASE_URL on Vercel; local Docker Postgres optional.
---

# Neon Postgres (compact)

Neon’s **official docs** are the source of truth. Do not rely on training data for API or console behavior.

- **Full doc index (search here first):** https://neon.com/docs/llms.txt  
- **Read any doc page as markdown:** append `.md` to the page URL, or request `Accept: text/markdown` on the normal URL.

## This repository

- **ORM:** Prisma 6 — `prisma/schema.prisma`, client in `lib/db.ts`. Connection string: `DATABASE_URL` (pooled/serverless-friendly URL on Vercel). See **DATABASE** in root `CLAUDE.md`.
- **Local:** Docker Postgres via `docker-compose.yml` is valid; production is Neon (hostname only in env — **never hardcode**).
- **Constraints:** Do not change `DATABASE_URL` or run migrations without explicit permission (`CLAUDE.md` rules).

## Topic entry points (open `.md` URLs or find fresher paths via llms.txt)

| Need | Start |
| --- | --- |
| Branching / previews | https://neon.com/docs/introduction/branching.md |
| PgBouncer / pooling | https://neon.com/docs/connect/connection-pooling.md |
| Serverless / edge driver | Search llms.txt for `neon-serverless` / connection methods |
| CLI (`neonctl`) | Search llms.txt for `neon-cli` |
| Admin / automation API | Search llms.txt for `neon-rest-api` or TypeScript SDK |

## How to use this skill

1. Resolve the exact doc URL from **llms.txt** when unsure.  
2. Prefer **fetching** the `.md` page over pasting long excerpts into the repo.  
3. For Neon Auth or `@neondatabase/neon-js`, follow the same index — this app does not use those yet; default stack is Prisma + Clerk.
