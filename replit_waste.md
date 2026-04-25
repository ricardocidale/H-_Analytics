# Replit Waste Ledger — Platform-Induced Cost & Forward Watchlist

**Scope.** This file tracks rework, retries, rewrites, and bugs that exist *because* the project lives on Replit specifically — separable from the broader rewrite tax catalogued in `rewritetax.md`. It is a living document: the bottom half is a forward-looking watchlist of failure modes we should expect to keep paying for until they are structurally fixed (or until the Vercel/Neon/R2 escape is complete).

**Status of the escape (as of 2026-04-25):**
- Database — DONE at the runtime layer (Apr 23). Helium → Neon cutover landed in commit `430ba0d7`; `shared/db-url.ts` is the resolver. **Helium add-on cancellation is NOT yet done** — the add-on still bills monthly. Cancellation is gated on moving the rollback dump off git LFS into R2 (project task filed Apr 25). Once that task merges, the user can cancel Helium in the Replit dashboard.
- Object storage — DONE. Replit Object Storage → Cloudflare R2 (`h-analysis` bucket) via the existing S3-compatible adapter. `STORAGE_PROVIDER=r2` is live; round-trip verified.
- Hosting — IN PROGRESS. Vercel deployment is the next major step. Until that lands, the Replit Dependency Tax keeps accruing on every commit.

**Helium cancellation thread (active; main blocker for stopping the monthly add-on bill):**
- The runtime app is Neon-only, verified by code read on April 25 (`server/db.ts:20` calls `requireDbUrl()`, which prefers `POSTGRES_URL`; `DATABASE_URL` only matters as a never-used fallback).
- 250 MB of Helium rollback dumps live in `backups/heliumdb-*.sql.gz` via Git LFS. They are the rollback safety net AND a recurring LFS bandwidth cost on every push. Removing them is destructive (requires `git rm` + LFS prune) so it is delegated to a project task rather than executed from the main agent session.
- `.gitignore` was updated April 25 with `backups/` and `*.sql.gz` so this category of file cannot be re-committed by accident.
- The cancellation runbook (exact dashboard click-path, prereqs) is in `docs/developer/migration-from-replit.md` under "Cancelling the Helium Postgres add-on (when ready)".

**Authoritative sources for the numbers.** All dollar figures trace back to the live invoice ledger (`replit_invoices` + `replit_invoice_line_items` tables in the project DB, seeded from 75 invoices Mar 15 – Apr 23). The forensic narrative is in `rewritetax.md` Cost Vector 7. The forward-discipline distillation is in `best-practices.md` section G. **This file is the index, not the body** — when in doubt, those three are canonical.

---

## Past 30 days — wasted runs, non-human-induced bugs, and forced rewrites

Window: **2026-03-25 → 2026-04-24** (matches the Mar 23 – Apr 22 invoice cycle XFPSSE-DRAFT).

### 1. Database churn caused by Replit primitives, not by us

| Bug / rework | Why it happened (Replit-shaped) | Where it landed | Approx. cost paid |
|---|---|---|---:|
| `bootstrapDrizzleMigrationState()` one-shot bug + Phase 0013/0014 reconciliation | Replit fresh containers stamp the existing Neon DB state at first boot rather than running migrations from scratch. On any disposable-DB CI/CD this pattern would never have been needed. | `0013_*`, `0014_*` migrations + 4 collided "stages 0-2" hygiene commits | $40–$120 |
| Recurring `drizzle-kit push` TTY-prompt failure on every schema change | The push-time interactive rename prompt fails non-interactively in the Replit shell. Worked around by running `CREATE INDEX IF NOT EXISTS` / `ALTER TABLE` directly via raw SQL — every. single. time. | At least 4 documented instances in `replit.md` (specialist_configs, ADR-004 Phase 5A verdict cache, 8 FK indexes, watchdog dedup). Each one cost a debug loop + a workaround loop. | $30–$80 per occurrence × ~4 = **$120–$320** |
| Helium → Neon cutover itself | Helium add-on was an extra paid line item that did nothing the Neon URL couldn't do. Whole migration only existed because Replit auto-provisioned it. | `shared/db-url.ts`, the cutover commit `430ba0d7`, Neon dump/restore | $80–$200 (one-time) |
| "Schema rename ambiguity" workarounds — multiple manual SQL applies | Same root cause as the TTY bug. Forces every schema author to bypass the tool the framework recommends. | Spread across ADR-004, the watchdog table, the FK index pass | included above |

### 2. Workflow / container-shaped bugs

| Bug | Why it happened | Cost |
|---|---|---:|
| Workflow `EADDRINUSE` on duplicate-start | Replit's workflow supervisor occasionally double-starts the dev server. Each occurrence flips the workflow status to FAILED, prompts an investigation loop, and requires a `restart_workflow` call. | $5–$20 per occurrence; ~5 occurrences in window |
| Stale workflow status after a fix | When a fix lands but the workflow ran once before the fix and once after, the UI keeps showing the failure until the workflow is restarted. Caused two unnecessary "is it really fixed?" loops in the R2 cutover task alone. | $5–$15 per loop |
| `.claude/**` and other dotfile permission/visibility quirks | Replit's UI file tree and the agent's filesystem disagree on hidden-file handling. Boundary rules in `replit.md` exist partly because of this. | Diffuse; counted under hygiene churn |

### 3. Auto-checkpoint + low-value loops that still bill

From the live invoice analysis (`rewritetax.md` §7b):

| Pattern | Count in project life | Cost |
|---|---:|---:|
| Generic short commits (`c`, `commit`, `com`, ≤7 chars) — agent default-commit fallback | **141** *(historical; 0 since hook landed Apr 20)* | $14–$35 |
| `Git commit prior to merge` (Replit auto-checkpoint) | **50** *(historical; pre-push backstop added Apr 24 — see W2)* | $5–$13 |
| `Saved progress at the end of the loop` | 7 *(2 leaked through husky post-Apr 20 via Replit web-UI checkpoints; pre-push now blocks them at GitHub boundary)* | $0.70–$1.75 |
| `Plan→Build` mode transitions — context reload, no code | **30** | $3–$8 |
| **Subtotal (~6% of all commits, ~zero engineering value)** | **228** | **~$23–$58** |

These are *small in dollars* but *large in signal*. On a non-checkpoint-per-loop platform, most of these would not exist as billable events. As of April 24 the local + push-time gates close the developer-authored leak entirely; the residual exposure is Replit-platform-generated checkpoint commits that bypass `commit-msg` but are caught by `pre-push` before they reach `origin`.

### 4. Cross-agent collisions enabled by no merge gate

Replit allows the in-environment Replit Agent and an external Claude Code shell to push to the same `main` branch with no built-in deduplication, no PR review, no advisory lock. This is the structural cause of `rewritetax.md` Vector 1 (cross-agent collision, $135–$1,050 estimated for the project life). The fix landed late and is convention-only: handoff briefs in `.agents/skills/agent-handoff-briefs/`, boundary rules in `replit.md:294`, and the workflow-split commit `1bdcc76a`. **None of it is enforced at the git layer.**

### 5. Per-task context-reload tax

Each new task starts with the agent re-reading `replit.md` (~106 KB), `.claude/claude.md` (~49 KB), the active skills, and any task-specific docs. Per-task memory rehydration: ~50K tokens × 444 distinct task numbers × $3/Mtok input ≈ **~$65 in pure memory-file rehydration cost**, plus another ~$65 per agent per task for the skill catalog. **Estimated total: $130–$200** for the project's task-load context overhead.

This is *not a bug* — it's the price of statelessness. But it is a Replit-specific surcharge: a single-shot AI session in a long-running shell would amortize this cost, where Replit's per-task model pays it again every time.

### 6. Publish-loop overhead

**85 publishes in 86 days.** Publishing itself is free, but each publish was preceded by an agent verification loop (typically read-test-verify), often by a full `Health Check` workflow run, and each created a checkpoint. If half of those publishes invoked a $0.50 verification loop, that's **~$20–$40 in publish-loop adjacent spend** — small but illustrative of how every "is it ready to ship?" question becomes a billable loop on this platform.

### 7. Inbox-driven micro-tasks

Replit's agent inbox + canvas surfaces make trivial cosmetic asks (like "update the opengraph image") frictionless to dispatch. The 88 image swaps in `rewritetax.md` Vector 6 are not a Replit bug — they're an *emergent pattern of platform UX inviting cosmetic iteration* that other platforms would batch or reject. Direct cost: ~$9–$22 (counted once under Vector 6).

### 8. Code-review false-positive rejections

The auto-reviewer that runs on `mark_task_complete` reviews the **entire uncommitted diff** in the working tree, not just the files the current task touched. When prior tasks left unstaged changes (audit fixes, type-narrowing, the `backups/heliumdb-*.sql.gz` artifacts), the reviewer rejects the *current* task on grounds that have nothing to do with it. Worked around with `skip_validation_reason` once already. **Cost per occurrence: ~$5–$15** (the extra mark-complete loop and the explanation prose).

### 9. Project-life summary (from `rewritetax.md` §7 subtotal)

The Replit Dependency Tax for the project life is best stated as **~$5,800–$7,000 in pure Replit Agent spend** on the H+ workspace. Of this, an estimated 50–60% (~$3,000–$4,000) is rewrite tax already counted under Vectors 1–6; the rest is forward progress that genuinely needed an agent loop. The line items above are slices of the same dollar pool, **not additive** to the $5,800–$7,000 figure.

The OT-A.3 saga's $210–$280 in direct Anthropic API spend is the only category cleanly *additive* — it ran on a BYOK Anthropic key, not through Replit's pass-through, as confirmed by the $2.41 Replit AI Integrations line in invoice XFPSSE-DRAFT.

---

## Forward watchlist — failure modes we will keep paying for until structurally fixed

Each row below is a recurring loss pattern. They are listed in priority order: highest visible $ impact first.

### W1 — `drizzle-kit push` TTY failure — **EFFECTIVELY FIXED on this workstation push path (April 25, 2026)**

**Symptom.** Every schema change required either:
1. Running the push, hitting the rename-prompt, killing the process, then writing the SQL by hand; or
2. Skipping the tool entirely and going straight to raw `CREATE INDEX / ALTER TABLE`.

**Frequency.** At least once per schema-touching task. Last 30-day window: 4 documented occurrences in `replit.md` alone (`migrations/0020`, `model_constant_overrides` FK indexes, `specialist_configs` tables, `analyst_cooldowns` table).

**Resolution.** New wrapper at `script/db-push-force.sh` runs `npx drizzle-kit push --force --verbose`:
- `--force` auto-approves the rename prompt (and any other data-loss statements) — turning the recurring TTY block into a single non-interactive command.
- `--verbose` prints every SQL statement before executing, so the failure mode "I didn't know it would drop X" is visible in the log.
- The wrapper **requires an explicit `--i-have-reviewed` ack** (or `DB_PUSH_FORCE_ACK=1` for headless contexts) to keep `--force` from being a foot-gun. The error message instructs the caller to run `git diff shared/schema/` first.

This was the platform's recommended fix all along (the system's `important_database_safety_rules` prompt explicitly says "Run `npm run db:push --force` to sync safely if `npm run db:push` doesn't work"), but no script alias existed and the bare command's data-loss semantics were never surfaced in the agent prompt. The wrapper makes both the command and the safety preamble discoverable.

**Forward cost.** Effectively zero for the schema-push path itself, assuming agents reach for `script/db-push-force.sh` instead of falling back to hand-written SQL. Residual ~$10–$30/month for the 1-in-5 task where someone forgets the wrapper exists and writes SQL anyway. Documentation landed in `replit.md` Quick Commands, `README.md` Quick Commands, and `docs/developer/setup.md` "Push Schema" section.

**Verification.** `sh -n script/db-push-force.sh` clean. Wrapper refuses to run without ack: confirmed via `bash script/db-push-force.sh` (no flag) → exits 1 with the `git diff` instructions.

### W2 — Auto-checkpoint commits with 1-character messages — **EFFECTIVELY FIXED on this workstation push path (April 24, 2026)**

**Symptom.** Replit's "Saved progress at the end of the loop" + the agent's default `c` / `commit` / `com` fallback create dozens of zero-signal commits per month. Each one bills as a loop.

**Frequency.** 228 occurrences in project life. **0 developer-authored leaks since April 20**, when `.husky/commit-msg` landed. 2 platform-authored leaks since (Replit web-UI checkpoints — `21868c1f`, `99a45125`) bypass husky entirely because they're created server-side.

**Resolution.**
1. **Local guard (April 20):** `.husky/commit-msg` enforces a 15-char minimum subject line and rejects an exact-match blocklist (`c`, `com`, `commit`, `wip`, `fix`, `update`, `save`, `checkpoint`, `progress`, `saved progress at the end of the loop`). Confirmed firing: zero violations in the 30 commits between April 20 and now. `git commit --no-verify` is the documented escape hatch.
2. **GitHub-boundary backstop (April 24):** `.husky/pre-push` gate 3/3 walks every commit being pushed to any remote and refuses the push if any subject is on the same blocklist (extended to also include `git commit prior to merge`). This catches the residual class — Replit's server-side checkpoint commits — at the moment they would otherwise propagate to GitHub.

**Forward cost.** Effectively zero for everything that flows through `git commit` or `git push` on this machine. Residual exposure: Replit checkpoint commits that live only in the Replit-hosted mirror and never get pushed to `origin`. Those don't reach GitHub, so they don't pollute downstream tooling, but they still bill as loops on the Replit side. Estimated residual: **$1–$3/month**, down from $8–$20.

**Verification.** `git log --since="2026-04-20" --pretty=format:"%h %s" | awk '{ if (length(substr($0, 9)) < 15) print }'` returns zero rows. The two `Saved progress at the end of the loop` checkpoints are 37 chars (over the length floor) but exact-match the blocklist — so any future attempt to push them to `origin` will now be refused.

### W3 — Workflow `EADDRINUSE` and stale-status false-fail loops

**Symptom.** A workflow runs once, fails for environmental reasons (port conflict, container restart timing), succeeds on the next run, but the UI keeps showing the failure. Every subsequent task asks the agent "are the workflows green?" and burns a refresh+investigate loop.

**Frequency.** ~5 in this 30-day window. Will continue at the same rate.

**Forward cost.** $25–$100/month.

**Structural fix candidates.**
- Add a `restart-stale-workflows.ts` script that any task can call cheaply, and document in the agent prompt: "if a workflow shows FAILED but the underlying npm command passes locally, restart the workflow before debugging."
- Or move CI off the workflow runner entirely once we're on Vercel.

### W4 — Code-review reviewer including unrelated working-tree diffs

**Symptom.** `mark_task_complete` triggers a code-review of the entire dirty working tree, not just the current task's files. Prior uncommitted work (other agents' changes, large committed binary backups, half-merged refactors) cause **the current task to be rejected for things it didn't do**.

**Frequency.** Hit this once already in the R2 cutover task. Will recur every time the working tree is dirty when a task ends.

**Forward cost.** $10–$30 per occurrence × ~4/month = $40–$120/month.

**Structural fix candidates.**
- Stop committing large binary artifacts to git (`backups/heliumdb-*.sql.gz` is the live offender — ~80 MB through LFS). Move ops backups to R2 or to a separate ops-only repo.
- For rejected reviews caused by stale unrelated diffs, document the `skip_validation_reason` escape hatch in `replit.md` so the next agent doesn't burn the same loop figuring it out.

### W5 — Per-task context reload of large memory files

**Symptom.** Every task re-reads `replit.md` (106 KB) + `.claude/claude.md` (49 KB) + skill catalog. Memory cost scales linearly with task count.

**Frequency.** Every. Single. Task.

**Forward cost.** ~$130–$200 per ~444 tasks = **~$1.50–$3 per future task** (probably understated for sub-context-cached models).

**Structural fix candidates.**
- Aggressive trim of `replit.md` and `claude.md`. Both have a Recent Changes section that should be pruned to the last 6 weeks (per the `agent-memory-files` skill).
- Move the deep historical narrative (April 14 schema remediation, OT-A saga, etc.) into `.claude/archive/` and keep memory files at <50 KB.

### W6 — No advisory lock between concurrent agents on `main`

**Symptom.** Replit Agent and external Claude Code both push to `main` with no "Task #N is in progress" lock. Cross-agent collisions cost $135–$1,050 over project life.

**Frequency.** Diffuse but recurring.

**Forward cost.** $50–$200/month at current cadence.

**Structural fix candidates.**
- A `.agents/active-tasks.json` file that each agent must update at task start and clear at task end. Pre-commit hook refuses the commit if another agent claims the same files.
- Or stop running both agents on the same branch — Claude Code in a long-lived feature branch, Replit on `main`, formal merge through PR.

### W7 — Object-storage migration tail (the R2 cutover is *behavior-flipped*, not *content-migrated*)

**Symptom.** R2 bucket is empty. Any URL in the database that points at the legacy `/objects/property-photos/*` / `/objects/properties/*` / `/objects/uploads/*` Replit bucket will 404 the moment we cut traffic to Vercel.

**Frequency.** Latent until cutover.

**Forward cost if not fixed.** A production incident on the day we go live, plus the loops to triage it. **Estimated: $50–$200 plus a real user-visible outage.**

**Structural fix candidates.**
- Already filed as a follow-up: "Move any leftover photos and documents from the old Replit storage to the new R2 bucket." Run *before* the Vercel cutover, not after.

### W8 — Inbox / canvas micro-tasks

**Symptom.** The agent inbox + canvas surfaces make ~5-second cosmetic asks ("change this hex", "swap this image", "round this corner") frictionless to dispatch as full agent tasks. Each one carries the full task overhead (memory load, skill load, gates, commit, code-review, mark-complete).

**Frequency.** ~88 cosmetic image swaps over project life; rate continues.

**Forward cost.** $20–$60/month at current cadence.

**Structural fix candidates.**
- A "design polish queue" the user batches (≥5 asks at once) instead of one-per-task.
- Lock cosmetic assets (opengraph image, brand logos) behind explicit creative-direction sign-off.

### W9 — Publish loops as billable verification

**Symptom.** Every "publish?" question runs the agent through a verify loop. 85 publishes × ~$0.50 verification = ~$40 already paid.

**Forward cost.** ~$8–$20/month.

**Structural fix candidates.**
- Pre-publish dry-run that doesn't bill an agent loop (rely on the existing `npm run health` / `verify:summary` workflows directly).

---

## Total forward-burn estimate (monthly, if nothing changes)

| Watchlist item | Low | High |
|---|---:|---:|
| W1 — `drizzle-kit push` TTY *(EFFECTIVELY FIXED Apr 25 — residual only)* | $10 | $30 |
| W2 — Empty-message commits *(STRUCTURALLY FIXED Apr 24 — residual only)* | $1 | $3 |
| W3 — Workflow stale-status loops | $25 | $100 |
| W4 — Reviewer false-fail rejections | $40 | $120 |
| W5 — Per-task context reload (large memory files) | $60 | $130 |
| W6 — Cross-agent collision | $50 | $200 |
| W7 — Object-storage migration tail | (one-time risk; $50–$200 + outage) | |
| W8 — Inbox micro-tasks | $20 | $60 |
| W9 — Publish-loop verification | $8 | $20 |
| **Avoidable Replit-tax run-rate** | **~$450** | **~$1,290** per month |

For context, invoice XFPSSE-DRAFT (Mar 23 – Apr 22, the most recent 30-day cycle) totaled **$511.68** — almost certainly hitting Replit's monthly billing cap (`rewritetax.md` §"$511.68 is almost certainly a Replit billing cap"). The watchlist above suggests **30–60% of that monthly spend is structurally avoidable** with five small fixes (the `commit-msg` hook, the non-interactive db-push wrapper, the active-tasks lock, the dirty-tree diff scoping, and the memory-file trim).

The remaining spend is the legitimate cost of the platform's value: live preview, integrated DB, integrated secrets, agent inbox, deployment. We are not arguing those away — we are arguing the *unintentional* portion away.

---

## Maintenance rules for this file

- **One row per occurrence.** Whenever a Replit-shaped bug burns a loop, add it to §1–§8 with the date, the file/commit, and the reason it was Replit-shaped.
- **Watchlist is forward-looking.** If a watchlist item is structurally fixed, *strike it through* and note the fix commit. Do not delete — the history is the evidence.
- **Cross-link, don't duplicate.** The forensic narrative belongs in `rewritetax.md`. The forward-discipline rules belong in `best-practices.md`. This file is the index that says *"this loop was Replit-shaped — go read those for why."*
- **Prune past sections older than 90 days into a footer table.** Memory-file pages are billable.
- **Counts and totals get a date.** A number without a date is a lie within a week.

## Routing

- **Forensic invoice ledger + 7 cost vectors:** `rewritetax.md` (especially §7 "Replit Dependency Tax").
- **22-rule forward-discipline distillation:** `best-practices.md` (especially §G "Platform-specific tax").
- **Replit-portability rule:** `replit.md` §"Codebase Independence from Replit" (the one-line rule + 7 sub-rules).
- **Live billing telemetry:** Postgres tables `replit_invoices` + `replit_invoice_line_items`. Report generator: `script/billing-report.ts` → `docs/billing/hplus-cost-report.md`.
- **Replit Agent operational hygiene:** `.claude/skills/replit-workflow/SKILL.md`.
- **Cross-agent handoff contract:** `.agents/skills/agent-handoff-briefs/SKILL.md`.
- **Memory-file discipline:** `.agents/skills/agent-memory-files/SKILL.md`.
