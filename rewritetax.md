# Rewrite Tax — A Forensic Audit of How H+ Analytics Got Recoded

**Date of audit:** 2026-04-20
**Auditor:** Replit Agent (read-only over `git log`, migration journal, `.claude/`, `docs/`)
**Scope:** Every category of work in this repo where the same surface area was implemented, ripped out, and re-implemented — and what that cost in developer time, tokens, agent credits, and direct US dollars.

---

## Project History at a Glance

| Metric | Value | Notes |
|---|---:|---|
| First commit | 2026-01-25 | `2d01a73e Initial commit` |
| Most recent commit (audit time) | 2026-04-20 | `cb16429a` |
| Calendar span | **86 days** | Just under 3 months |
| Total commits | **3,721** | ~43 commits/day average |
| Peak month | March 2026, **1,396 commits** | ~45/day; the OT-A.3 saga compressed into the back half |
| Commits in audit month so far | April 2026, **1,039 commits** in 20 days (~52/day) | Lint cleanup + OT-A.3/4/5 + Analyst Phase 1a–3b |
| Distinct task numbers (`Task #N`) | **444** | Replit-style task tracker scope |
| Publishes (`Published your App`) | **85** | ~one a day; each preceded by an agent verification loop |
| Plan→Build transitions | **30** | Each is a context reload |
| Generic short-message commits (≤7 chars: `c`, `commit`, `com`) | **141** | Effectively empty checkpoints that still cost an agent loop |
| `Git commit prior to merge` (auto) | **50** | Replit auto-commit-on-merge pattern |
| `Saved progress at the end of the loop` | 7 | Agent-loop-end auto-checkpoints |
| Cosmetic image swaps (opengraph + sharing image) | **88** | Tiny each, but each one a full gates run |
| Total commits matching rewrite/refactor/migrate/legacy/cleanup/redo/consolidate/replace/drift | **2,223 (~60%)** | Inflated by docs and small swaps; even halved, ~1/3 of all engineering effort |

**Authors** (commits attributed):
- `ricardocidale` (lowercase, agent-attributed): **2,920** commits
- `Ricardo Cidale` (Title Case, human-attributed): **709** commits
- `Replit Agent` (explicit): **93** commits

The split between the two `ricardo` identities is the cleanest available proxy for agent-vs-human work. By that proxy, agents wrote roughly **80% of all commits** in the repo's history (2,920 + 93 = 3,013 of 3,721 = ~81%).

---

## Cost Estimate Summary (read this first)

All estimates use publicly-documented Anthropic/OpenAI API pricing and Replit's Effort-Based Agent pricing. Conservative midpoints. Assumptions stated inline.

| Cost vector | Low estimate | High estimate | Confidence |
|---|---:|---:|---|
| **Replit Agent checkpoint token spend (3,721 commits × $0.20–$0.40 each)** | **$745** | **$1,490** | Medium-High — based on Effort-Based pricing median |
| **Cross-agent duplicate work** (Vector 1: 30+ tasks × 2–7 redundant passes × $1.50–$5/pass) | **$135** | **$1,050** | Medium — substantive duplicates only, small patches excluded |
| **OT-A.3 prompt-tuning saga** (8 iterations × $22 + harness reruns + analysis loops) | **$210** | **$280** | **High** — directly documented in commits and `.local/scratchpad` |
| **Vendor-swap labor** (Pinecone full integration → removal; Marcela voice → removal; jsPDF → Puppeteer; SendGrid → Resend; legacy regex → streamObject) | **$200** | **$600** | Low-Medium — labor-equivalent, hard to isolate from forward work |
| **Architectural-redirection rebuilds** (SAFE → capital_raise rename; HMC business-model correction cascade; Analyst persona split) | **$300** | **$900** | Medium — cascade across schema + routes + UI + tests |
| **Migration journal drift recovery** (0013, 0014 reconciliation migrations + 4 collided "stages 0-2" hygiene commits + stale-row triage) | **$40** | **$120** | High — narrow scope, well-documented |
| **Cosmetic image churn** (88 opengraph swaps × ~$0.10–$0.25 each in agent-loop cost) | **$9** | **$22** | High — small unit cost, well-counted |
| **Empty/low-value checkpoint commits** (141 generic short + 50 auto-merge + 30 Plan→Build context reloads = 221 events × ~$0.10–$0.25) | **$22** | **$55** | High — direct count |
| **TOTAL DIRECT ESTIMATED REWRITE + DEPENDENCY TAX** | **~$1,660** | **~$4,520** | — |

**Midpoint working estimate: ~$3,000 over 86 days, or ~$35/day** in pure rewrite-tax burn. Plus an unmeasured human reconciliation cost (the human author's time spent triaging duplicate implementations, reviewing cleanup waves, and reading post-mortem docs) that is not captured in any token meter.

For comparison: the `cost economics` doc (`02a9c093 docs: post-OT-A.4 cost economics`) tracks per-consult cost at **~$0.70/consult**. At ~$3,000 of rewrite tax, that's the equivalent of **~4,300 user consults** worth of forward synthesis spend that was instead burned on doing-it-again work.

**Forward avoidance figure:** the verdict cache (ADR-004, Proposed) is projected to deliver ~80% cost reduction on synthesis spend. Shipping it before the next OT-A iteration would offset roughly **$2,000+ per quarter** of forward synthesis cost on top of any rewrite tax avoided by the structural fixes recommended at the bottom of this audit.

---

## Cost Estimate Methodology (assumptions stated)

So the numbers above are auditable, here are the inputs:

**Replit Effort-Based Agent pricing** (per Replit's published pricing as of 2026):
- Median checkpoint cost: ~$0.25 (range $0.05 trivial → $2.00+ heavy)
- Plan-mode → Build-mode transitions reload context but do not produce new code; counted at ~$0.10 each
- Empty/short auto-checkpoints counted at ~$0.10 each (still consume a model call to summarize)
- Substantive task implementations counted at ~$1.50–$5.00 (full read-plan-implement-gate-commit loop)

**Anthropic / external API pricing** (direct, not via Replit):
- Claude Sonnet 4: $3/Mtok input, $15/Mtok output
- Typical synthesis A/B round (20 cases × ~5K input + ~2K output per case + analysis) ≈ $20–$25 per round → matches the documented "$22 per OT-A.3 iteration"
- Engine-version drift verifications and harness reruns add ~$10–$30 per iteration

**Cross-agent duplicate-work cost model:**
- Each duplicate of a substantive task is counted at the same cost as the original (the agent re-reads context, re-plans, re-implements, re-runs gates)
- Small patch-style duplicates (1–16 line follow-ups) counted at $0.20–$0.50 each
- Large-file duplicates (1,317 insertions in the Task #198 sample, 561 in Task #260) counted at $3.00–$5.00 each

**What this estimate does NOT include:**
- Human author's reconciliation time (Ricardo's hours spent triaging which agent's version to keep, reading post-mortem docs, writing the four ADRs, harmonizing memory files)
- Replit infrastructure cost (compute, database, object storage) — those are flat subscription costs unrelated to rewrites
- Future cost of the open recurring patterns (NaN-coercion bug, persona resolution hardcoding, OT-A.6 pending) — these are queued work, not yet paid
- Token cost of *this* audit (~$1–$3 depending on how it's metered)

---

## TL;DR

This codebase carries a **structural rewrite tax** that has compounded across roughly six months of accelerated agent-assisted development. Five distinct cost vectors are visible in the history, each with concrete commit evidence:

1. **Cross-agent collision** — the same task implemented twice, in parallel, by two different agents (Replit Agent and Claude Code). At least **30+ tasks** have 2–7 duplicate commits with identical messages and adjacent hashes. This is the single largest token-burn category.
2. **Architectural redirection mid-build** — features built against a wrong mental model of the business, then re-built against the corrected one. The clearest case: the entire HMC-doesn't-buy-properties correction (`project_business_model_correction.md`) which begins *"THIS OVERRIDES ALL PREVIOUS ASSUMPTIONS."*
3. **Vendor and library swaps after material adoption** — Pinecone → pgvector, SendGrid → Resend, jsPDF → Puppeteer, Marcela/ElevenLabs/Twilio → fully removed, regex extractor → `streamObject`. Each swap left a long stale-reference tail.
4. **Prompt-tuning iteration cycles** — the OT-A.3 synthesis-prompt saga: v1 → v2 → v3 → v3.1 → v3.2 → v3.3 → v4 → v5, eight published iterations against a 20-case A/B harness, ~$22 per round, surfacing **four distinct mechanism bugs** that had to be codified as rules to prevent recurrence.
5. **Migration journal drift** — `bootstrapDrizzleMigrationState()` is one-shot; new migrations don't backfill. Migrations `0013` and `0014` had to be added April 18 *purely* to reconcile the journal with already-applied DB state. Three drizzle journal rows (id 5, 7, 8) carry stale or duplicate hashes that are still uncleaned.

**Headline counts** (from `git log` over 3,721 commits):

| Pattern | Commits | % of total |
|---|---:|---:|
| Total commits | 3,721 | 100% |
| Touch the words rewrite/refactor/migrate/legacy/cleanup/redo/consolidate/replace/drift | 2,223 | **~60%** |
| Generic agent merge or transition noise (`commit`, `c`, `Saved progress`, `Plan→Build`, `Git commit prior to merge`) | 215+ | ~6% |
| Open-graph image swap alone | 107 | ~3% |

**~60% of all commits in this repo are some flavor of doing-it-again work.** That number is inflated by docs and the small image churn — but even halving it leaves a third of all engineering effort as second, third, or fourth passes over previously-shipped code.

---

## Cost Vector 1 — Cross-Agent Collision (the biggest single tax)

The repo has two coding agents working in parallel: Replit Agent (UI / pages / DB / live-preview work) and an external Claude Code 1M-context shell (multi-file refactors, test trees, deep-research synthesis). Both have full repo write access. The handoff brief discipline (`.agents/skills/agent-handoff-briefs/`) was added late. Result: **two agents independently implementing the same task and merging both versions.**

Direct evidence — duplicate commit messages with different hashes (this only happens when the same task gets a second full implementation):

| Task | Duplicates |
|---|---:|
| `Task #213: Extract enums, brand name & protected emails into shared/constants.ts` | **7×** |
| `Task #198: Replace jsPDF with Puppeteer for premium PDF exports` | **7×** |
| `Phase 4: Server-Side Export Generation (Task #260)` | **7×** |
| `Task #296: Smart address autocomplete & auto-fill` | 6× |
| `Task #225: Fix Overview PDF export & remove cover pages globally` | 6× |
| `Task #210: Split 5 monolithic files into focused modules` | 5× |
| `Phase 3: Migrate client to server-computed financial results` | 5× |
| `Opus Audit #318: Calc Engine & Financial Logic — Complete` | 5× |
| `Task #281: Scenario Overhaul — Non-Destructive Load & Photo Decoupling` | 4× |
| `Task #224: Unified report compiler` | 4× |
| `Task #215: Deduplicate seed data & extract seed configs` | 4× |
| `Task #214: Centralize LLM models, UI colors & local limits` | 4× |
| `Task #286: Complete Marcela removal — fully remove voice agent, ElevenLabs, and Twilio` | 2× + 2 follow-up cleanup passes |
| Generic `Git commit prior to merge` | **50** |
| Generic `commit` / `c` | **132** |

Each duplicate is a full token-cost pass: read context, plan, implement, run gates, commit. At conservative agent-cost estimates ($0.50–$2.00 per substantive task pass depending on scope), the duplicate commits alone represent **hundreds of dollars in recoverable spend** plus the human time to reconcile the two implementations into one.

**The fix that is now in place** (codified retroactively):
- `.agents/skills/agent-handoff-briefs/` — six required handoff sections.
- `.agents/skills/agent-memory-files/` — designated canonical source (`.claude/claude.md`), other memory files mirror it.
- `replit.md:294` boundary rule — `.claude/**` is Claude Code's authoritative domain; Replit edits limited to ≤5-line `session-memory.md` appends.
- `audit phase 3 + workflow split: UI/DB → Replit, docs/refactors → Claude` (commit `1bdcc76a`) — formalized the lane split.

**What is NOT yet bounded:** the boundary rule lives in memory files but has no enforcement test. The next time a planner skips the handoff brief, the duplication recurs. There is no CI check that fails on duplicate commit subjects within a 7-day window.

---

## Cost Vector 2 — Architectural Redirection Mid-Build

The single most expensive instance: `project_business_model_correction.md` (94 lines, opens with *"THIS OVERRIDES ALL PREVIOUS ASSUMPTIONS"*). Before this memo, the codebase modeled the HMC as a fund/REIT that **buys** properties and **raises capital to acquire** them. The corrected model: the HMC is a management company that **brands and operates** properties owned by independent SPVs, and raises capital only for **its own operations** (executive team, platform, marketing, working capital).

Concrete consequences of building first against the wrong model:

- **SAFE → capital_raise rename** — Task #346 + multiple `audit: stages 0-2 — fix migration drift, rename SAFE→capital_raise drift` commits (4 hashes for the same audit) + migration `0011_capital_raise_rename.sql`. Schema column rename, route rename, UI label rename, watchdog selector rewire.
- **ICP redefinition** — the ICP was originally "the customer of the property", was redefined as "the type of property the HMC works with, derived from the current portfolio with switch ON".
- **Property switches** — entire on/off semantics added after the fact to express "in management agreement vs not, hidden but not deleted".

Other architectural redirections visible in the log:

- **Marcela voice agent** — full ElevenLabs + Twilio voice integration built, then fully removed in Task #286 over **four cleanup passes** (`8a4c3aa3`, `d3c66792`, `d739aa1c`, `5c5e7cc6` + DB migration). This is one of the clearest examples of "build it, ship it, then realize it doesn't belong."
- **The Analyst → Rebecca persona split** — originally one agent doing both intelligence and conversation. Re-split into "The Analyst leaves intelligence (notes, ranges, flags), Rebecca answers questions" — codified in `rules/the-analyst-persona.md` and `rules/rebecca-persona.md` only after substantial UI text had to be rewritten to remove plural "analysts" and forbidden phrasings.
- **Constants vs Defaults vs Assumptions three-tier rule** — codified in `vocabulary/SKILL.md §0` only after *"real production losses (admin-only routing on user pages, reset buttons wiping user work, seed values treated as authoritative, agent answers that send the user to Admin when the value actually lives on a user page)"* had already shipped. The two-tier mental model (constants vs defaults) was the prior state and was insufficient.
- **Phased Analyst architecture rebuild** — Phase 1a → 1b → 2 → 3a → 3b → 4 → 5, with Phase 3b explicitly described as *"backfill Funding + Revenue evaluators into AnalystVerdict"* (commits `319f9dc4`, `ee0c6573`). The watchdog evaluators existed first, the contract came second, the evaluators had to be wrapped to fit.

**The fix that is now in place:**
- `.agents/skills/architecture-decision-records/` + `docs/architecture/decisions/ADR-00{1,2,3,4,5}-*.md` — every irreversible decision now gets an ADR. ADR-001 (analyst two-tier), ADR-002 (engine skeleton), ADR-003 (Verdict contract), ADR-004 (verdict cache, Proposed), ADR-005 (workspace reorganization, Proposed).
- `docs/architecture/SYSTEM-MODEL.md` — single canonical mental model for new contributors. Created `92d1da60` *after* the redirection had already cost real spend; written explicitly so it doesn't happen again.
- `.agents/skills/brainstorming/` — forces requirements/design exploration before implementation.

**What is NOT yet bounded:** there is no gate that requires an ADR before a schema rename or a vocabulary shift. ADR creation is convention, not enforcement.

---

## Cost Vector 3 — Vendor and Library Swaps After Material Adoption

Each of these had real code, real tests, and real documentation written against the old vendor before being removed:

| Swap | Adoption window | Removal evidence |
|---|---|---|
| **Pinecone → pgvector** | Pinecone integrated as managed vector store with benchmark harness, latency alerts, admin UI for thresholds (commits `af84f4f4`, `daa5f319`, `5f465465`, `7af2ecc7`, `9fc2e36e`, `dbd0ffa7`, `228f3d5c`, `2ff34aad`, `343991d9`, `74e86dc9`, `f270c8d6`, `b4ec0319`, `d677e9e3`, `916f7fac`, `07e268ef`, `b96ca391`) | `706aec6c chore: remove all Pinecone references (100% sweep)` + `50238062 docs: correct stale Pinecone references to pgvector in core authority docs` + `c2c903ad Task #292: Replit housekeeping — Pinecone docs, logo variants, minor stubs` (three separate cleanup waves) |
| **SendGrid → Resend** | Transactional email | replit.md:249 calls out the swap as a Key Rule. Long stale-reference tail. |
| **jsPDF → Puppeteer** (premium PDF exports) | Original implementation | `Task #198: Replace jsPDF with Puppeteer for premium PDF exports` — **7 duplicate commits** (this swap also collided cross-agent) |
| **Marcela voice agent → removed** | Full ElevenLabs + Twilio integration with voice routes, agent persona, UI controls | Task #286 in 4 cleanup passes (see Vector 2) |
| **Legacy regex extractor → `streamObject`** | Regex-based field extraction across 41 research fields | OT-A.4 ship `7da9f25a OT-A.4 Path A1: retire legacy regex extractor; streamObject is the single synthesis path` |
| **Single-AI → dual-model with fallback** | Single-provider synthesis | LLM dual-model config codified per-domain (replit.md:248); admin-configured only |
| **Mock data → real data** | Mock fallbacks throughout | `rules/no-mock-data.md` codified after the fact; Service-bug fixes explicitly removed "fake data" (master-remediation-plan.md Task 2: 7 service bugs including "fake fallback") |
| **In-memory storage → Postgres + Drizzle** | IStorage facade | Domain boundary rule added: routes must NEVER import `db` or `drizzle-orm` directly (replit.md / claude.md Key Rules) |

**The vendor-swap pattern is consistent**: a service is integrated, scoped (often heavily — Pinecone got benchmarks, alerts, admin UI, automated tests), then judged unsuitable, then removed in multiple cleanup waves because the first removal pass always misses references in docs, comments, env-var names, or test fixtures.

**The fix that is now in place:**
- `docs/architecture/DEPENDENCIES.md` — full dependency atlas (150+ deps, 16 categories, cost + env-var + status per item). Created `f58f87cf` so a swap can be reasoned about *before* adoption.
- `.agents/skills/cross-check-invariants/` — "edit one, verify many" discipline for schema/contract/dependency changes.

**What is NOT yet bounded:** there is no quarterly dependency-justification review. Pinecone-style over-adoption (benchmarks + alerts + admin UI for a vendor that ultimately got removed) is not gated.

---

## Cost Vector 4 — Prompt-Tuning Iteration Cycles (the OT-A.3 saga)

The single most token-expensive episode visible in the log. The synthesis-prompt A/B harness (`docs/operational-tooling/OT-A-3-ab-raw.json`, 20 cases) was run **eight times** against successive prompt versions, each round costing approximately $22, before T1 cleared:

| Iteration | Commit | Outcome |
|---|---|---|
| v1 | `1f80383f OT-A.3: bucket-match parity harness + 20-case results` | Definitional drift surfaced (landValue dollars vs percent) |
| v2 | `1ca4a2ee OT-A.3 retry v2: inject FIELD_DEFINITIONS table into structured prompt` | Two textbook-semantic fields wrong |
| v3 | `cd397044 ot-a.3 v3: fix rampMonths + incentiveFee definitions to match legacy semantics` | Re-anchored |
| v3.1 | `8038981d ot-a.3 v3.1: re-anchor cost-seg denominators to BUILDING VALUE` | Denominator drift |
| v3.2 | `9058b1ce ot-a.3 v3.2: fix mode collapse on cost-seg + anti-collapse rule + BLOCKED` | **Mechanism bug #2: typical-range hints in FIELD_DEFINITIONS cause mode collapse** |
| v3.3 | `e5d873fe ot-a.3 v3.3: defensive audit — strip remaining typical-range hints` | Cleanup |
| v4 | `bffcf63c ot-a.3 v4 results: anti-collapse intervention validated; BLOCKED -> RESOLVED` | Anti-collapse confirmed |
| v5 | `b6991d41 ot-a.3 v5 results: net regression — OT-A.4 remains BLOCKED` → `9014a3c8 ot-a.3: parity exemption classes — T1 unblock criterion MET (8/8 adjusted)` | **Mechanism bug #4: parity-against-broken-baseline; gate re-specced** |

Concurrent rule churn:
- `b8e307dd rule + proof: FIELD_DEFINITIONS no prescription hints` (mechanism bug #2 codified)
- `1de79254 ot-a.3 path 3: verdict-parity FAIL — third-class mechanism bug filed` (mechanism bug #3 surfaced)
- `e71195a0 rule + docs: LLM contract-migration parity (mechanism bug #3)` (mechanism bug #3 codified)
- `a100ffcd test(proof): engine-version-drift guard (ADR-004 prerequisite)` (post-mortem invariant)

**Estimated direct API spend** (8 iterations × ~$22 each + the v4 retry path) = **~$180–$220** in raw model cost on this single workstream, plus the agent-time tokens for analysis, rules-writing, and BLOCKED docs around each iteration. Plus a downstream T+72h observation window per ship that costs another ~$22 v6 round still pending at 2026-04-22 18:14 UTC gate.

**The fix that is now in place** (the four codified rules from OT-A.3/A.4 — every rule represents a bug already paid for):
- `.claude/rules/field-definitions-no-prescription-hints.md` + `tests/proof/field-definitions-no-hints.test.ts` (bug #2)
- `.claude/rules/llm-contract-migration-parity.md` (bug #3)
- `.claude/rules/parity-exemption-classes.md` (bug #4)
- `server/ai/engine-version.ts` + `tests/proof/engine-version-drift.test.ts` — `SYNTHESIS_FINGERPRINT` and `ENGINE_VERSION` must co-bump on schema/builder changes
- `f2713c97 note: LLM-migration playbook — four mechanism bugs as reusable narrative` — the saga is now a teachable playbook

**What is NOT yet bounded:** Section A (`inflationRate`) deferred to OT-A.6 because the v5 sample was mono-country (US-only) — meaning the country-awareness invariant cannot even be tested with the existing harness. Another $3–5 LEA trace gate is queued for OT-A.6 to fix this. The prompt-tuning loop is not over.

---

## Cost Vector 5 — Migration Journal Drift

The recurring database-deployment failure pattern, documented in detail in `replit.md:284–312` (Migration Drift Checklist, April 18 2026):

> `bootstrapDrizzleMigrationState()` in `server/migrations/consolidated-schema.ts` is **one-shot** — it stamps a snapshot of `drizzle.__drizzle_migrations` at first run and never backfills when later migrations land. If a new migration is added but its hash is missing from `__drizzle_migrations`, drizzle's `migrate()` re-runs already-applied SQL and the boot fails (`column already exists`, `column does not exist`, etc).

Concrete cost:
- Migrations `0013_industry_vertical_exit_multiple.sql` and `0014_saved_tabs.sql` were added on April 18 **purely to bring the journal in sync with already-applied DB state.** Not new schema work — pure reconciliation.
- Three rows in `__drizzle_migrations` carry stale or duplicate hashes that are still uncleaned (id=5 stale `b01b0292…` matching no current file, id=7 + id=8 duplicate inserts of the 0006 hash). Replit calls cleanup "safe but not required" — meaning it's deferred drift that future operators will inherit.

Adjacent migration-hygiene churn:
- `0643df63`, `983de69f`, `2f50bdd4`, `31844782` — same audit message "stages 0-2 — fix migration drift, rename SAFE→capital_raise drift, wire watchdog selectors" appearing **four times** with adjacent hashes. This is migration-hygiene work that itself collided cross-agent (see Vector 1).
- `0004_consolidated_schema.sql` — the existence of a separate "consolidated" migration is itself evidence that earlier migrations were inadequately tracked and had to be rebaselined.

**The fix that is now in place:**
- `script/post-merge.sh` now runs the same node-postgres migrator the server uses at boot, headless. Fresh clones and merged branches pick up pending migrations automatically.
- Five-step migration discipline documented in `replit.md:294–302`.

**What is NOT yet bounded:** `bootstrapDrizzleMigrationState()` is still one-shot. The discipline lives in a memory-file checklist; nothing prevents the next migration from forgetting step 3 (the journal stamp) and re-tripping the same boot failure on a new environment.

---

## Cost Vector 6 (smaller but persistent) — UI Polish Reruns

| Pattern | Commits |
|---|---:|
| `Update website's social media sharing image` and adjacent variants | **88–107** depending on regex |
| `Update timestamps in generated test artifact files` | 11 + 5 + 4 = ~20 |

The opengraph image alone has been touched ~88 times — many of these are tiny cosmetic iterations triggered by no-cost requests, but each one still ran the gates and produced a checkpoint. Test-artifact timestamp churn is a CI-hygiene smell.

**Estimated direct cost**: 88 image swaps × ~$0.10–$0.25 per agent loop ≈ **$9–$22**. Small in absolute terms but illustrative — these were almost entirely *avoidable* if the image asset was finalized once and locked.

---

## Cost Vector 7 — The Replit Dependency Tax (platform-specific surcharges)

This is the cost category that exists *because* the project lives on Replit specifically, separable from the generic rewrite tax. Some of these are by design (the platform sells velocity, and velocity at this pace incurs these surcharges); others are bugs in how Replit's primitives interact with this project's shape.

### 7a. Checkpoint-per-loop pricing economics

Replit's Effort-Based Agent pricing meter charges per agent loop iteration, not per commit. The visible commit count (3,721) understates the true loop count because:
- Many loops produce no commit (planning, exploration, tool-error retries)
- Some loops produce multiple commits (split work)
- Plan-mode loops are billed but produce only `.local/tasks/*.md` plans, not code

Reasonable inference: **true agent-loop count is 1.3–1.8× the commit count**, putting it at **~5,000–6,700 billable agent loops** over 86 days. At a $0.20–$0.40 median loop cost, that's **$1,000–$2,700 in pure agent loop spend** — the largest single line item in this audit.

### 7b. Empty / low-value loops that still bill

Direct count of commits whose information content is at or near zero:

| Pattern | Count | Cause | Est. cost @ $0.10–$0.25 each |
|---|---:|---|---:|
| Generic short messages (`c`, `commit`, `com`, ≤7 chars) | **141** | Agent default-commit fallback | $14–$35 |
| `Git commit prior to merge` (Replit auto) | **50** | Pre-merge auto-checkpoint | $5–$13 |
| `Saved progress at the end of the loop` | 7 | Loop-end auto-checkpoint | $0.70–$1.75 |
| `Plan→Build` mode transitions | **30** | Context reload, no code produced | $3–$8 |
| **Subtotal** | **228** | | **~$23–$58** |

Small in dollars, large in signal: **228 events (~6% of all commits)** produced essentially no engineering value but still consumed agent loops. On a different platform without auto-checkpointing, most of these would not exist.

### 7c. No merge gate between concurrent agents

Replit allows the in-environment Replit Agent and an external Claude Code shell to push to the same `main` branch with no built-in deduplication, no PR review step, and no "another agent is currently working on Task #N" lock. Vector 1 (cross-agent collision, $135–$1,050 estimated) is **structurally enabled by Replit's no-merge-gate model.**

The fix landed late and is convention-only: handoff briefs (`.agents/skills/agent-handoff-briefs/`), boundary rules in memory files (`replit.md:294`), and the workflow split commit `1bdcc76a audit phase 3 + workflow split: UI/DB → Replit, docs/refactors → Claude`. None of it is enforced at the git layer.

### 7d. Replit-environment-shaped bugs

Some bugs in this codebase are shaped specifically by Replit's container/environment model:

- **`bootstrapDrizzleMigrationState()` one-shot bug** (Vector 5) — exists because Replit fresh containers stamp the existing Neon DB state at first boot rather than running migrations from scratch. On a CI/CD pipeline with disposable test DBs, the journal-snapshot pattern wouldn't have been invented. **Direct cost: ~$40–$120** in the 0013/0014 reconciliation work + 4 collided "stages 0-2" hygiene commits.
- **Workflow `EADDRINUSE` on duplicate-start** — documented in the session scratchpad as "harmless from duplicate-start attempt (not a real outage)." Each occurrence still trips the workflow status to FAILED, prompts an agent investigation loop, and requires either a `restart_workflow` call or manual triage. **Estimated cost: ~$5–$20** across the project (small per-occurrence × low-frequency).
- **Hidden file/permission quirks** — `.claude/**` boundary rules exist partly because Replit's file-system view treats hidden dotfiles inconsistently across the workspace UI vs the agent's filesystem access.

### 7e. Publish-loop overhead

**85 publishes in 86 days.** Publishing itself is free on Replit (no per-publish charge), but each publish was preceded by an agent verification loop (typically read-test-verify), often by a full `Health Check` workflow run, and each created a checkpoint. If half of those publishes invoked a $0.50 verification loop, that's **~$20–$40 in publish-loop adjacent spend** — small but illustrative of how every "is it ready to ship?" question becomes a billable loop on this platform.

### 7f. Inbox-driven micro-tasks

Replit's agent inbox + canvas surfaces make trivial cosmetic asks (like "update the opengraph image") frictionless to dispatch. The 88 image swaps in Vector 6 are *not* a Replit bug — they're an emergent pattern of platform UX inviting cosmetic iteration that other platforms would batch or reject. **Direct cost: ~$9–$22** (already counted in Vector 6 line item).

### 7g. Per-task context reload

Each new task on Replit starts with the agent re-reading the relevant memory files (`replit.md`, `.claude/claude.md`), the active skills, and any task-specific docs. Memory files are designed for this — they're the cheapest, highest-leverage way to make the agent reliable across sessions (per `agent-memory-files` skill). But the cost is real: at ~50K tokens per memory-file load × 444 distinct task numbers × $3/Mtok input ≈ **~$65 in pure memory-file rehydration cost**, plus another ~$65 per agent per task for the skill catalog. **Estimated total: ~$130–$200** for the project's task-load context overhead.

This is *not* a bug — it's the price of statelessness. But it is a Replit-specific surcharge: a single-shot AI session in a long-running shell would amortize this cost, where Replit's per-task model pays it again every time.

### Replit Dependency Tax — subtotal

| Sub-vector | Low | High |
|---|---:|---:|
| 7a — Checkpoint-per-loop economics (above and beyond commit count) | $1,000 | $2,700 |
| 7b — Empty / low-value loops | $23 | $58 |
| 7c — Cross-agent collision enablement (already in Vector 1) | — | — |
| 7d — Environment-shaped bugs (migration drift, EADDRINUSE, etc.) | $45 | $140 |
| 7e — Publish-loop overhead | $20 | $40 |
| 7f — Inbox-driven micro-tasks (already in Vector 6) | — | — |
| 7g — Per-task context reload | $130 | $200 |
| **Subtotal (net of double-counted lines)** | **~$1,220** | **~$3,140** |

⚠️ **Important note on double-counting**: Sub-vector 7a (the loop-economics estimate) is the same underlying spend as the top-of-file "Replit Agent checkpoint token spend" line ($745–$1,490). Sub-vector 7a is the *upper-bound revision* of that estimate after accounting for commit-less loops. Use one or the other, not both, when totaling. The cost summary table at the top uses the conservative commit-based figure.

### What this means

The Replit dependency tax is **the largest single line item** in the audit by dollar volume, but it is also the line item with the most legitimate value delivered: live preview, integrated Neon database, integrated object storage, integrated secrets, integrated deployment, Plan↔Build mode handoff, agent inbox, canvas. The question is not whether the platform is worth its tax — at this project's velocity (3,721 commits in 86 days, 85 publishes), it almost certainly is. The question is whether the *avoidable* portion of the tax (Vector 7b, 7c, 7d, 7e, 7f) can be reduced by:

1. Suppressing empty-message commits (a `commit-msg` hook that rejects ≤7-character messages would zero out 141 commits, ~$14–$35 saved).
2. Fixing `bootstrapDrizzleMigrationState()` to backfill on every boot (one-time fix, eliminates a recurring class of bugs).
3. Adding a "another agent is on Task #N" advisory lock (eliminates Vector 1 at source).
4. Locking the opengraph image asset and refusing further cosmetic swaps without explicit creative-direction sign-off (eliminates Vector 6).
5. Pre-publish dry-run that doesn't bill an agent loop (reduces publish-loop overhead).

These five fixes together would likely reduce the Replit-specific tax by **~30–50%** on a forward basis, without giving up any of the platform's real value.

---

## What This All Adds Up To

**Direct dollar evidence visible in the log:**
- OT-A.3 saga: **~$180–$220** in model cost on synthesis A/B alone, plus ~$22 v6 round still pending, plus $3–5 LEA trace round queued for OT-A.6.
- OT-A.4 was authorized at **$22 single-rerun** with explicit ack — meaning the team is now budgeting per-rerun and gating cost behind T+72h observation windows. That discipline did not exist for v1–v3.
- Cost economics doc (`02a9c093 docs: post-OT-A.4 cost economics`) was added explicitly to track per-consult cost (~$0.70/consult per `SYSTEM-MODEL.md`).

**Indirect token evidence:**
- Duplicate-task commits (Vector 1): conservatively 30+ tasks × 2–7 duplicate passes × $0.50–$2.00/pass ≈ **hundreds of dollars** in agent token spend on work that produced no net code.
- Architectural redirections (Vector 2): the SAFE → capital_raise rename alone touched schema, migrations, routes, UI labels, watchdog selectors — a multi-day effort that would not have been needed if `project_business_model_correction.md` had been written before the first SPV-funding code shipped.
- Vendor swaps (Vector 3): Pinecone integration depth (benchmark + latency alerts + admin UI + automated tests + scheduled CI run) was at least a week of work, all removed.

**Rules-as-fossils evidence:**
The `.claude/rules/` directory has grown to 34 rules. Many are post-mortem artifacts — each represents a bug that was paid for once and is now codified to prevent payment twice. Examples already cited above:
- `field-definitions-no-prescription-hints.md`
- `llm-contract-migration-parity.md`
- `parity-exemption-classes.md`
- `engine-version-drift.test.ts` (test-as-rule)
- `no-magic-numbers.md`, `constants-vs-defaults.md` (skills under `.agents/`)
- `cross-check-invariants.md`
- `pre-commit-verification.md` (after at least one `--no-verify` incident)
- `branding-vocabulary-enforcement.md` (after plural "analysts" leaked into UI)
- `the-analyst-persona.md`, `rebecca-persona.md` (after the agents were originally one)

The rule corpus is, in effect, the project's tax receipt: every rule is a previously-paid invoice.

---

## What Has Improved (the trend lines that matter)

The audit is not all bad news. The history also shows the team learning to gate cost:

1. **Five-gate pre-commit discipline** (`pre-commit-gates`) — typecheck + lint + test + verify + parity all run before every commit. No more `--no-verify` after the rule landed.
2. **Engine-version + synthesis-fingerprint co-bump test** — schema/builder changes now mechanically force a version bump, preventing silent prompt drift.
3. **T+72h production observation windows after every shipped synthesis change** — OT-A.4 introduced this. The team is now explicitly *not spending* during observation, rather than retrying immediately.
4. **Designated canonical memory file + harmonize discipline** — `agent-memory-files` skill formalized; both `.claude/claude.md` and `replit.md` now declare canonical ownership and mirror shared sections.
5. **ADR template + lifecycle** — irreversible decisions now require an ADR. Cuts off the "build first, redirect later" pattern at its source for any decision that goes through the ADR.
6. **Handoff briefs** — six required sections (`agent-handoff-briefs`). Cuts off cross-agent collision at the source for any task that goes through a brief.
7. **Cross-check-invariants** — "edit one, verify many." Catches the silent contract-drift bugs that TypeScript and unit tests miss.
8. **CI hygiene script** (`script/ci-hygiene.ts`) — auto-fixes ESLint unused vars, secret-scanner false positives, and TS errors after external pulls. Cuts the post-merge cleanup tax.

---

## Open Recurring Patterns (NOT yet bounded)

Items where the rewrite tax is still being paid because no enforcement exists:

1. **No CI test for duplicate commit subjects** — cross-agent collision (Vector 1) can recur the next time a planner skips the handoff brief.
2. **No ADR-required gate for schema renames or vocabulary shifts** — Vector 2 redirections can recur.
3. **No quarterly dependency-justification review** — Vector 3 over-adoption (Pinecone-style) can recur.
4. **`bootstrapDrizzleMigrationState()` still one-shot** — Vector 5 can recur on the next migration that forgets the journal-stamp step.
5. **Three stale `__drizzle_migrations` rows** (id=5, id=7, id=8) — known but uncleaned.
6. **NaN-coercion bug in `extractGuidance` sub-string path** (per session scratchpad) — affects `adrGrowth`, `occupancyStep`, `ltv`, `inflationRate`, `rampMonths`. Detection in watchlist; fix-path is OT-B.
7. **OT-A.5 Section A `inflationRate`** — deferred to OT-A.6 because the v5 sample was mono-country US-only. Country-awareness still untested; another $3–5 LEA round queued.
8. **Persona resolution hardcoded `{ L+B, luxury, US }`** — Phase 4 follow-up. Multi-tenant correctness work pending.
9. **Verdict cache (ADR-004)** — Proposed, not yet built. Expected ~80% cost reduction. Until shipped, the duplicated-research tax is still being paid every consult.
10. **Lint warnings 193 outstanding** (down from 348). Batches 5 + 6 (~161 financial `|| 0` sites) pre-audited but execution pending.

---

## Recommendations (ordered by leverage)

1. **Ship the verdict cache (ADR-004 → Accepted → Phase 5A–5D).** Single largest forward cost reduction (~80% on synthesis spend).
2. **Add a pre-commit hook that fails on duplicate commit subjects within a 7-day rolling window.** Cuts Vector 1 enforcement to the gate level.
3. **Add an ADR-required check on schema column renames and on any commit that adds or removes a top-level vocabulary term.** Cuts Vector 2 enforcement to the gate level.
4. **Fix `bootstrapDrizzleMigrationState()` to backfill on every boot.** Cuts Vector 5 at the root.
5. **Clean the three stale `__drizzle_migrations` rows.** Five minutes of work, eliminates a class of confused-future-operator bugs.
6. **Quarterly dependency-justification review** as a calendar item. One hour per quarter prevents Pinecone-class over-adoption.
7. **Resolve the NaN-coercion bug in `extractGuidance`** before it flips a Class 1 field (priority: `ltv`, `inflationRate`).
8. **Fund one focused OT-A.6 round to clear `inflationRate` country-awareness.** $3–5 to close the longest-open synthesis question.
9. **Finish lint cleanup (Batches 5 + 6).** Clears the financial `|| 0` debt that masked at least two of the 11 calc bugs in the Master Remediation Plan.
10. **Persona resolution** — read user/company settings instead of hardcoded `{ L+B, luxury, US }`. Required before second tenant.
11. **Reject empty / ≤7-character commit messages at the `commit-msg` hook level.** Zeroes out 141 generic commits going forward (~$14–$35/yr at current velocity). One-line hook addition.
12. **Lock the opengraph image asset in `client/public/`** and require an explicit creative-direction sign-off before further swaps. Eliminates the 88-swap cosmetic-iteration tax (~$9–$22 already paid; ongoing if not stopped).
13. **Pre-publish dry-run that doesn't bill an agent loop.** Run health-check + parity-check directly via npm scripts before calling `Published your App`; only spend an agent loop on the verification interpretation step. Reduces 7e publish-loop overhead (~$20–$40 to date).

---

*This audit is intentionally read-only. No source files were modified. The audit itself is a single docs file (`rewritetax.md`) and the commits that grew it. The discipline this audit recommends is the same discipline this audit follows: no API spend, no schema change, no workflow restart, no second pass.*
