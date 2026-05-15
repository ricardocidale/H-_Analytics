![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/Norfolk-Group/H-Analytics?utm_source=oss&utm_medium=github&utm_campaign=Norfolk-Group%2FH-Analytics&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

# H+ Analytics

H+ Analytics is a hospitality-sector financial analytics platform built by **[Norfolk AI](https://norfolkai.com)** for boutique hotel operators and their investors. It models property-level pro formas, company-wide assumptions, and investor returns — then surfaces that intelligence through an AI assistant (Rebecca), a suite of named AI Specialists, and a precision slide-factory pipeline that produces L+B 6-slide investor decks.

Norfolk AI is the software company that builds and maintains H+ Analytics.

## Tech Stack

The project is a pnpm monorepo. The frontend is React + Vite + Tailwind + shadcn/ui. The backend is an Express API server using Drizzle ORM on a Neon (PostgreSQL) database. Cloudflare R2 handles object storage. AI calls go through Anthropic, OpenAI, and Gemini. The financial engine (`lib/engine`, `lib/calc`) is deterministic TypeScript — no LLM approximations in any calculation path. Production runs on Railway; development runs inside Replit with a shared reverse-proxy that routes by path.

For full architecture detail, stack versions, environment variables, and all inviolable rules, see **`CLAUDE.md`** (the canonical deep source for every coding agent working in this repo).

## Agent Taxonomy

H+ Analytics uses a named-agent system where every pipeline member is a person with a Brazilian or Italian first name. Four concepts cover the entire taxonomy:

**Agent** — A named pipeline member that does substantive work using an LLM. Agents receive structured inputs, apply reasoning or generation, and produce structured outputs. Every agent declares a `role`, `short_description`, and `long_description`. Agents may be job-specific (Swarm format) or cross-app (Specialist format).

**Minion** — A deterministic helper invoked by an agent. Minions never call an LLM and exercise no judgment — they transform, validate, extract, or diff data according to fixed rules. Minions carry a single name. Examples: Aldo (PDF/PPTX extractor), Dino (pixel-diff calculator), Carlo (Zod validator).

**Specialist** — An Agent used across more than one product surface, not bound to a single pipeline. Specialists carry a single name (no NN suffix) and their outputs surface directly in the product UI as intelligence badges, conviction ranges, or cited copy. Examples: Lucca (Content Drafter), Maya (Visual Inspector).

**Swarm** — A coordinated team of job-specific Agents that collaborate on one pipeline stage. Swarm members use the `Name-NN` zero-padded format (e.g., Sofia-01, Lorenzo-03). When a swarm finishes, its combined output is a single artifact handed to the next pipeline stage. Swarm members are never reused outside their pipeline.

Canonical source and full member inventory: `CLAUDE.md` § 10 and `.agents/skills/slide-factory/SKILL.md`.

## Key Entry Points

| What | Where |
|---|---|
| Architecture rules & inviolable constraints | `CLAUDE.md` |
| Replit-specific run/operate guide | `replit.md` |
| Slide factory pipeline & member roster | `.agents/skills/slide-factory/SKILL.md` |
| Financial engine authoring authority | `.agents/skills/financial-engine/SKILL.md` |
| Known issues | `docs/issues/known-issues.md` |
