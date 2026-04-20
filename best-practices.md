# Best Practices Distilled from `rewritetax.md`

Forward-discipline playbook derived from the H+ Analytics rewrite-tax audit (Apr 2026). Every rule below represents a bug already paid for at least once. Read this file before starting the next project; install the rules first, ship the code second.

---

## A. Multi-agent / multi-contributor hygiene (Vector 1 — biggest single tax)

1. **One canonical memory file, the rest mirror.** Pick one file as the source of truth (in this project: `.claude/claude.md`). Every other agent-readable doc declares itself a mirror with a hard cap on what it can override. Without this, the same task gets re-implemented from two different mental models.
2. **Mandatory handoff briefs at every ownership boundary.** Six required sections: scope, files in/out of bounds, expected interfaces, what's already done, what to verify, what *not* to touch. No verbal handoffs. Add a CI check that fails on duplicate commit subjects within a 7-day rolling window — that one check would have caught 50+ collision cases here.
3. **Lane split for parallel agents.** UI / live preview / DB → the in-environment agent. Multi-file refactors / test trees / deep research → the long-context shell. Document the split in the canonical memory file and reject PRs that cross lanes without a brief.

## B. Avoiding architectural redirection (Vector 2)

4. **Write the business-model memo before the first schema commit.** The single most expensive moment in this project was `project_business_model_correction.md` arriving *after* the codebase already modeled the wrong entity. A one-page "what is this thing actually" doc, signed off by the customer, is the cheapest insurance you'll ever buy.
5. **ADR-or-it-didn't-happen for irreversible decisions.** Schema column renames, vocabulary shifts (e.g., "default" → "assumption"), vendor adoptions, contract shapes. Make ADR creation a *gate*, not a convention — a pre-commit hook that blocks any schema-rename diff without a referenced ADR file.
6. **Three-tier vocabulary discipline.** Constants vs Defaults vs Assumptions (or your domain's equivalent) need precise, written, enforceable definitions. Two-tier mental models leak. The cost of leaks is real production bugs (admin-only routing on user pages, reset buttons wiping user work).

## C. Vendor & library decisions (Vector 3)

7. **Maintain a dependency atlas before adding the next dep.** One file, every dependency, with: cost, env-var, status, what would replace it. Update on every add. The Pinecone-class over-adoption (benchmark harness + alerts + admin UI for a service that ultimately got removed) is what happens without one.
8. **Quarterly dependency-justification review.** One hour per quarter. Any dep that can't be defended in 30 seconds is a candidate for removal *before* it grows tendrils.
9. **No-mock-data rule from day one.** Mock fallbacks always outlive their welcome. Codify "no silent fallbacks; explicit failure" in your rules file before the first integration ships.

## D. AI / prompt-tuning workstreams (Vector 4 — the OT-A.3 saga)

10. **Version-fingerprint your prompts and engines.** A `SYNTHESIS_FINGERPRINT` + `ENGINE_VERSION` that must co-bump on schema or builder changes turns mysterious regressions into visible drift. Ship with a proof test that fails the build if they desync.
11. **Per-rerun budget caps with explicit acks.** Every A/B harness run gets a budget number (e.g., $22) and an explicit ack from the owner before launch. T+72h observation window between rerun and next decision. This single discipline is what kept v6 from happening in this project before v5 was understood.
12. **Each "mechanism bug" becomes a written rule + a proof test.** When you find that "typical-range hints in field definitions cause mode collapse," that's not just a fix — it's a rule file plus a test that fails if the rule is ever violated again. Four rules, four bugs paid for, four bugs that don't recur.
13. **Don't measure prompts against a broken baseline.** Define parity-exemption classes upfront so "the baseline is wrong here" is an expected outcome, not a failed gate.

## E. Database & migration hygiene (Vector 5)

14. **Migration journals must backfill on every boot, not snapshot once.** Any one-shot stamping pattern creates "rebaseline" migrations later (in this project: `0013` and `0014` were pure reconciliation, not new work). Run the same migrator at boot that you run in CI.
15. **Five-step migration discipline, written down.** When adding a migration: (1) write SQL, (2) update Drizzle schema, (3) update the journal-stamp, (4) test on a fresh container, (5) update the post-merge script. Step 3 is the one that gets forgotten.
16. **Schema is additive by default.** New tables, new columns, new indexes. Renames and drops require an ADR. This single rule eliminates 80% of migration drift.

## F. Cosmetic & inbox-driven churn (Vector 6)

17. **Lock creative assets after first sign-off.** The opengraph image was touched ~88 times here. Once a designer signs off, the asset is frozen — further changes require explicit creative-direction sign-off, not a one-line agent ask.
18. **Reject ≤7-character commit messages at the `commit-msg` hook.** This project had 141 such commits (`c`, `commit`, `com`). One hook line zeroes them out forever.

## G. Platform-specific tax (Vector 7 — when on a per-loop pricing platform)

19. **Pre-publish dry-runs that don't bill an agent loop.** Run health-check + parity directly via npm scripts before invoking the agent for "is it ready to ship?". Only spend a loop on the verification interpretation step.
20. **Suppress empty checkpoints / loop-end auto-commits where possible.** ~228 events in this project (~6% of all commits) produced no engineering value but still consumed loops. Configure your tooling to skip them.
21. **Use plan mode deliberately, not as a default.** Each plan↔build mode transition is a billable context reload. Batch planning into one session before switching to build.
22. **Treat memory-file rehydration as a real cost.** Keep canonical memory files lean and well-structured — a 100KB file rehydrated 444 times is real money. Move historical narrative into archive files; keep the live file under ~10–20KB of high-leverage rules.

---

## The meta-lesson

Almost every fix in this audit was codified *retroactively* — after the cost had been paid. The discipline that pays for itself fastest is **writing the rule before the bug**, not after. The `.agents/skills/` directory in this project is full of rules that each represent a bug already paid for at least once. On the next project: read this file first, install the rules first, ship the code second.

---

*Source: `rewritetax.md` (Apr 20, 2026 forensic audit, 781 lines). The seven cost vectors and their dollar evidence are documented there in full; this file is the forward-looking distillation.*
