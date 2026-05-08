# Skills Index

Skills are reusable process documents that guide AI agents through complex, multi-step tasks. Each skill lives in its own directory with a `SKILL.md` file.

**Invoke in Claude Code:** `Skill("<skill-name>")`
**Invoke in Replit Agent:** type `"use the <skill-name> skill"`

---

## Compound Engineering Core Loop

These five skills form the CE workflow. Run them in order for any non-trivial feature.

| Skill | Purpose |
|---|---|
| `ce-brainstorm` | Explore requirements through dialogue; outputs a requirements doc |
| `ce-plan` | Break a requirements doc into a step-by-step implementation plan |
| `ce-work` | Execute a plan with quality discipline |
| `ce-code-review` | Multi-persona code review before merging |
| `ce-compound` | Capture new knowledge as a skill or ADR after shipping |

---

## Project-Specific (Norfolk / H+ Analytics)

| Skill | Purpose |
|---|---|
| `norfolk-code-review` | CE code review pre-tuned for this repo: financial model correctness, Drizzle/Postgres safety, TypeScript quality, schema-seed-engine coherence |
| `ricardo-hospitality-analyst` | Persona for hospitality financial analysis |
| `front-of-app-admin-isolation` | Boundary rules between the public-facing app and admin pages |
| `specialist-persona-naming` | Naming conventions for AI specialist personas in this codebase |
| `steady-state-naming` | Naming conventions for steady-state/stable values |
| `inflation-cascade` | Rules for propagating inflation assumptions through the projection engine |
| `external-data-source-integration` | Five-layer FRED template for adding any new API/MCP/data source — admin_resources + minion + DB cache + Rebecca tool + parity map |
| `hplus-resource-catalog` | Full inventory of H+ data resources (APIs, MCPs, URLs, prompts) — the platform data moat; check before building features that need market or financial data |

---

## UI & Frontend

| Skill | Purpose |
|---|---|
| `ui-page-patterns` | **Start here for any UI page.** Classifies page type, finds canonical examples, enforces required states (loading/empty/error), action button discipline, tab URL sync, quality gate. Works for any React + Tailwind app. |
| `ce-frontend-design` | Significant layout and visual design work |
| `ui-ux-pro-max` | Deep UX/usability review and improvement |
| `frontend-design` | General frontend design guidance |
| `shadcn` | shadcn/ui component usage and patterns |
| `web-design-guidelines` | Visual design principles |
| `next-best-practices` | Next.js-specific best practices |
| `vercel-composition-patterns` | Component composition patterns for Vercel-hosted apps |
| `vercel-react-best-practices` | React best practices for Vercel deployments |

---

## AI Agents & Chatbots

| Skill | Purpose |
|---|---|
| `embedded-ai-agent` | **The Rebecca pattern.** Build or extend a streaming AI chat agent in any web app. Four-layer architecture: Settings → Context Assembly → LLM Dispatch → Frontend. Covers AbortController, history window, conversation persistence, admin test-chat panel. |
| `analyst-research-buttons` | Add analyst/research trigger buttons to any page |
| `browser-use` | Browser automation within an AI agent |

---

## Code Quality & Architecture

| Skill | Purpose |
|---|---|
| `architecture-decision-records` | Write ADRs for irreversible decisions |
| `ce-debug` | Systematic debugging workflow |
| `cross-check-invariants` | Verify invariants across subsystems (includes H+-specific pairs) |
| `sse-streaming-discipline` | Checklist for React SSE-consuming components — ref cleanup, retry state, terminal-phase polling |
| `constants-vs-defaults` | When to use constants vs. configurable defaults |
| `no-magic-numbers` | Eliminate magic numbers; use named constants |
| `inventory-before-build` | Before adding new tooling/gates, inventory what already exists |
| `pre-commit-gates` | Set up pre-commit quality gates |
| `ci-hygiene` | CI configuration hygiene |
| `prefer-external-dependencies` | When to reach for a package vs. write it |

---

## Portability & Platform

| Skill | Purpose |
|---|---|
| `replit-independence` | Keep the codebase portable off Replit — isolate all `@replit/*` and `REPL_*` reads to a single host adapter |
| `ce-worktree` | Use Git worktrees for isolated feature work |

---

## Documentation & Research

| Skill | Purpose |
|---|---|
| `brainstorming` | Collaborative design before implementation (use `ce-brainstorm` instead when available) |
| `copywriting` | Writing clear, user-facing copy |
| `ce-doc-review` | Review and improve documentation |
| `ce-session-extract` | Extract learnings from a completed session |
| `ce-session-inventory` | Inventory what was built in a session |
| `skill-creator` | Create new skills or improve existing ones |
| `find-skills` | Discover skills relevant to a task |
| `agent-handoff-briefs` | Write structured handoff notes between agents |
| `agent-memory-files` | Manage agent memory and context files |

---

## Export & File Formats

| Skill | Purpose |
|---|---|
| `pdf` | PDF generation and manipulation |
| `pptx` | PowerPoint generation |
| `ce-gemini-imagegen` | Image generation via Gemini |
| `remotion-best-practices` | Video/animation with Remotion |

---

## Reusable Patterns (any project)

These skills have no Norfolk-specific references and can be dropped into any React + Tailwind project.

| Skill | Why reusable |
|---|---|
| `ui-page-patterns` | Teaches how to find canonical pages via grep; no hardcoded paths |
| `embedded-ai-agent` | Describes the Rebecca four-layer pattern abstractly; adaptable to any provider |
| `architecture-decision-records` | Standard ADR format, no project assumptions |
| `brainstorming` / `ce-brainstorm` | Pure process; no domain knowledge required |
| `replit-independence` | Platform isolation pattern applies to any Replit-hosted project |
| `skill-creator` | Meta-skill for building new skills in any CE-enabled project |

---

## Full Skill List

See `ls .agents/skills/` for the authoritative list. This README covers the most commonly used skills; the directory may contain additional experimental or in-progress skills.
