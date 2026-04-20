/**
 * One-shot seeder for the H+ Analytics work queue into Linear (team NAI).
 *
 * Creates:
 *  - 9 labels (created if missing, by name)
 *  - 2 projects (ADR-004, ADR-005)
 *  - 16 issues (8 homework + 5 ADR phases + 3 audit follow-ups)
 *
 * Idempotent: queries existing entities by name first; skips creation if
 * a match exists. Safe to re-run; will not duplicate.
 *
 * Usage: npx tsx script/linear/seed-queue.ts [--dry]
 */
import { linearQuery, listTeams, LinearAPIError } from "../../server/integrations/linear";

const DRY = process.argv.includes("--dry");

interface State { id: string; name: string; type: string }
interface Label { id: string; name: string }
interface Project { id: string; name: string }
interface Issue { id: string; identifier: string; title: string }

const LABELS = [
  { name: "tooling", color: "#5e6ad2" },
  { name: "observability", color: "#0f7b6c" },
  { name: "migrations", color: "#bb87fc" },
  { name: "time-gated", color: "#f2c94c" },
  { name: "blocked-on-steward", color: "#eb5757" },
  { name: "tech-debt", color: "#95a2b3" },
  { name: "audit-finding", color: "#ff6900" },
  { name: "adr-004", color: "#26b5ce" },
  { name: "adr-005", color: "#5e6ad2" },
];

interface IssueSeed {
  title: string;
  description: string;
  stateName: string;     // workflow state name to map by
  labelNames: string[];
  projectName?: string;
  dueDate?: string;      // YYYY-MM-DD
}

const HOMEWORK: IssueSeed[] = [
  {
    title: "Push unpushed commits to origin",
    description: "Push local commits to origin/main. **Status: DONE.** Shipped as commit `0f04d0e3` (analyst cooldown slice).\n\nSource: `.claude/replit-handoffs/homework-after-analyst-slice.md` §1",
    stateName: "Done",
    labelNames: ["tooling"],
  },
  {
    title: "Finish T008/T009 analyst soft-gate slice",
    description: "Land the Analyst soft-gate slice with all 5 gates green. **Status: DONE** (prior session).\n\nSource: `.claude/replit-handoffs/homework-after-analyst-slice.md` §2",
    stateName: "Done",
    labelNames: [],
  },
  {
    title: "ADR-004 Phase 5A — verdict cache DB migrations",
    description: "Add nullable columns: `research_runs.cache_key` (text + index), `research_runs.cache_inputs_hash` (text), `assumption_guidance.superseded_at` (timestamp). All applied via raw SQL (drizzle-kit push hits TTY conflict on this DB).\n\n**Status: DONE.** Commit `4ebe71ae`.\n\nSource: `.claude/replit-handoffs/phase-5a-verdict-cache-migrations.md`",
    stateName: "Done",
    labelNames: ["migrations", "adr-004"],
    projectName: "ADR-004: Cognitive Engine verdict cache",
  },
  {
    title: "ADR-005 Phase 1 — workspace bootstrap (pnpm + turborepo)",
    description: "Tooling-only, zero file moves. Add pnpm-workspace.yaml, turbo.json, .npmrc, packageManager field, .turbo/ to .gitignore. 7-step verification including Replit deploy dry-run on a feature branch.\n\n**Status: IN PROGRESS** — Steward authorized 2026-04-20.\n\nSource: `.claude/replit-handoffs/phase-1-workspace-bootstrap.md`",
    stateName: "In Progress",
    labelNames: ["tooling", "adr-005"],
    projectName: "ADR-005: Workspace bootstrap (pnpm + turborepo)",
  },
  {
    title: "NaN-coercion fix in extractGuidance",
    description: "Pure logic fix: `Number.isFinite` guard in `server/ai/guidance/extractor.ts`.\n\n**Status: BLOCKED — time-gated.** OT-A.4 T+72h observation window closes 2026-04-22T18:14Z. Shipping a logic change during observation would be indistinguishable from regression signal.\n\nSource: `.claude/replit-handoffs/nan-coercion-extractguidance-fix.md`",
    stateName: "Backlog",
    labelNames: ["time-gated"],
    dueDate: "2026-04-22",
  },
  {
    title: "OT-A.5 v6 prompt rerun",
    description: "Authorize v6 prompt rerun on existing BYOK key. Validate three tracks: inflationRate Class 2 verification, 6 T2 USALI anchors, 4 non-T1 mode-collapse fields. Draft package staged at `.local/drafts/`.\n\n**Status: BLOCKED — time-gated.** Same OT-A.4 window closes 2026-04-22T18:14Z.",
    stateName: "Backlog",
    labelNames: ["time-gated"],
    dueDate: "2026-04-22",
  },
  {
    title: "Sentry financial contexts",
    description: "Structured error classes (`FinancialSentryError`, `BalanceSheetImbalanceError`, …), breadcrumbs, 100% sampling for financial-critical errors.\n\n**Status: DONE in spirit.** Basic plumbing landed — `client/src/lib/sentry.ts` exists, `initClientSentry()` called from `App.tsx:54`, `setClientUser` wired. Full structured-error catalog from the handoff is a future-iteration question.\n\nSource: `docs/operational-tooling/HANDOFF-replit-sentry-financial-contexts.md`",
    stateName: "Done",
    labelNames: ["observability"],
  },
  {
    title: "PostHog wiring",
    description: "Initialize posthog-js + event tracking for Analyst consults, verdict acceptance, conviction-floor downgrades.\n\n**Status: DONE in spirit.** `client/src/lib/analytics.ts` shipped with init/identify/8 typed wrappers. Initialized via `requestIdleCallback` from `App.tsx`. PII regression (email in identify props) fixed in commit `033078ba`.\n\nSource: `docs/operational-tooling/HANDOFF-replit-posthog-wiring.md`",
    stateName: "Done",
    labelNames: ["observability"],
  },
];

const ADR_004: IssueSeed[] = [
  {
    title: "Phase 5A — verdict cache columns + index",
    description: "Three nullable columns + index. **DONE** in `4ebe71ae`. Schema additions in `shared/schema/intelligence-v2.ts`.",
    stateName: "Done",
    labelNames: ["adr-004", "migrations"],
    projectName: "ADR-004: Cognitive Engine verdict cache",
  },
  {
    title: "Phase 5B — engine-client.ts read path",
    description: "Verdict cache read with TTL + input-hash invalidation in `engine/analyst/cognitive/engine-client.ts`. **DONE** in `6a83e44a`.",
    stateName: "Done",
    labelNames: ["adr-004"],
    projectName: "ADR-004: Cognitive Engine verdict cache",
  },
  {
    title: "Phase 5C — write-after hook (cache population)",
    description: "Populate `cache_key` + `cache_inputs_hash` on verdict write; supersede prior guidance via `assumption_guidance.superseded_at`. Owner: Claude (engine side). Blocked by 5B (now unblocked).",
    stateName: "Todo",
    labelNames: ["adr-004"],
    projectName: "ADR-004: Cognitive Engine verdict cache",
  },
];

const ADR_005: IssueSeed[] = [
  {
    title: "Phase 1 — workspace bootstrap (pnpm + turborepo)",
    description: "Tooling-only, zero file moves. 7-step verification gate — step 7 (Replit deploy dry-run on feature branch) requires steward action. Steward authorized 2026-04-20.\n\nSource: `.claude/replit-handoffs/phase-1-workspace-bootstrap.md`",
    stateName: "In Progress",
    labelNames: ["adr-005", "tooling"],
    projectName: "ADR-005: Workspace bootstrap (pnpm + turborepo)",
  },
  {
    title: "Phase 2 — packages/shared extraction",
    description: "Extract `shared/` → `packages/shared/src/`; rewrite `@shared/*` → `@norfolk/shared/*` across all consumers via codemod. Blocked by Phase 1 deploy-dry-run PASS. Claude to write the Phase 2 handoff once Phase 1 lands.",
    stateName: "Backlog",
    labelNames: ["adr-005"],
    projectName: "ADR-005: Workspace bootstrap (pnpm + turborepo)",
  },
];

const AUDIT_FOLLOWUPS: IssueSeed[] = [
  {
    title: "Refactor tryReserveAnalystCooldown to single-round-trip CTE",
    description: "Architect audit (2026-04-20) flagged: after losing the UPSERT gate, the helper does a second SELECT to compute `retryAfterMs`. A third in-flight request can refresh the row between those statements, returning a stale (sometimes >60s) hint.\n\n**Admission safety is preserved** — only the response number is approximate.\n\nFix: emit a single CTE returning `{granted, reserved_at}` so the read sees the row from the same statement.\n\nFile: `server/storage/intelligence-v2.ts` :: `tryReserveAnalystCooldown`",
    stateName: "Todo",
    labelNames: ["tech-debt", "audit-finding"],
  },
  {
    title: "Add real-DB concurrency test for analyst cooldown",
    description: "Architect audit (2026-04-20) flagged: the existing `Promise.all` test uses a vi.mock with a JS Map — proves handler branching, not real SQL contention. Add a live-DB test that fires N parallel `tryReserveAnalystCooldown` calls and asserts exactly one wins. Pair with the CTE refactor.\n\nFile: `tests/server/analyst-admin-route.test.ts` (or new `tests/db/analyst-cooldown.integration.test.ts`)",
    stateName: "Todo",
    labelNames: ["tech-debt", "audit-finding"],
  },
  {
    title: "Replace research_runs cache_key index with partial index",
    description: "Architect audit (2026-04-20): `research_runs_cache_key_idx` is a full btree on a column that will be mostly-NULL until Phase 5C populates it. Postgres indexes NULLs — use a partial index to halve the size.\n\n```sql\nDROP INDEX research_runs_cache_key_idx;\nCREATE INDEX research_runs_cache_key_idx\n  ON research_runs (cache_key)\n  WHERE cache_key IS NOT NULL;\n```\n\nDo before Phase 5C goes live to avoid an index rebuild on a hot column.",
    stateName: "Todo",
    labelNames: ["tech-debt", "audit-finding", "adr-004", "migrations"],
  },
];

async function getStates(teamId: string): Promise<State[]> {
  const data = await linearQuery<{ workflowStates: { nodes: State[] } }>(
    `query($teamId: ID!) { workflowStates(filter: { team: { id: { eq: $teamId } } }) { nodes { id name type } } }`,
    { teamId },
  );
  return data.workflowStates.nodes;
}

async function getLabels(teamId: string): Promise<Label[]> {
  const data = await linearQuery<{ issueLabels: { nodes: Label[] } }>(
    `query($teamId: ID!) { issueLabels(filter: { team: { id: { eq: $teamId } } }) { nodes { id name } } }`,
    { teamId },
  );
  return data.issueLabels.nodes;
}

async function getProjects(teamId: string): Promise<Project[]> {
  const data = await linearQuery<{ projects: { nodes: Project[] } }>(
    `query($teamId: ID!) { projects(filter: { accessibleTeams: { id: { eq: $teamId } } }) { nodes { id name } } }`,
    { teamId },
  );
  return data.projects.nodes;
}

async function getIssues(teamId: string): Promise<Issue[]> {
  const data = await linearQuery<{ issues: { nodes: Issue[] } }>(
    `query($teamId: ID!) { issues(filter: { team: { id: { eq: $teamId } } }, first: 250) { nodes { id identifier title } } }`,
    { teamId },
  );
  return data.issues.nodes;
}

async function createLabel(teamId: string, name: string, color: string): Promise<Label> {
  const data = await linearQuery<{ issueLabelCreate: { success: boolean; issueLabel: Label } }>(
    `mutation($input: IssueLabelCreateInput!) { issueLabelCreate(input: $input) { success issueLabel { id name } } }`,
    { input: { name, color, teamId } },
  );
  if (!data.issueLabelCreate.success) throw new Error(`label create failed: ${name}`);
  return data.issueLabelCreate.issueLabel;
}

async function createProject(teamId: string, name: string, description: string): Promise<Project> {
  const data = await linearQuery<{ projectCreate: { success: boolean; project: Project } }>(
    `mutation($input: ProjectCreateInput!) { projectCreate(input: $input) { success project { id name } } }`,
    { input: { name, description, teamIds: [teamId] } },
  );
  if (!data.projectCreate.success) throw new Error(`project create failed: ${name}`);
  return data.projectCreate.project;
}

async function createIssue(input: {
  teamId: string;
  title: string;
  description: string;
  stateId: string;
  labelIds: string[];
  projectId?: string;
  dueDate?: string;
}): Promise<Issue> {
  const data = await linearQuery<{ issueCreate: { success: boolean; issue: Issue } }>(
    `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title } } }`,
    { input },
  );
  if (!data.issueCreate.success) throw new Error(`issue create failed: ${input.title}`);
  return data.issueCreate.issue;
}

function pickState(states: State[], name: string): State {
  const exact = states.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (exact) return exact;
  const fallbackByType: Record<string, string> = {
    "Done": "completed",
    "In Progress": "started",
    "Todo": "unstarted",
    "Backlog": "backlog",
  };
  const t = fallbackByType[name];
  const fallback = t ? states.find((s) => s.type === t) : undefined;
  if (!fallback) throw new Error(`no workflow state matches "${name}"; available: ${states.map((s) => `${s.name}(${s.type})`).join(", ")}`);
  return fallback;
}

async function main() {
  try {
    const teams = await listTeams();
    const team = teams.find((t) => t.key === "NAI");
    if (!team) throw new Error("NAI team not found");
    console.log(`team: ${team.name} (${team.id})`);

    const [states, existingLabels, existingProjects, existingIssues] = await Promise.all([
      getStates(team.id),
      getLabels(team.id),
      getProjects(team.id),
      getIssues(team.id),
    ]);
    console.log(`states: ${states.map((s) => `${s.name}/${s.type}`).join(", ")}`);
    console.log(`existing labels: ${existingLabels.length}, projects: ${existingProjects.length}, issues: ${existingIssues.length}`);

    if (DRY) {
      console.log("\n--- DRY RUN ---");
      const all = [...HOMEWORK, ...ADR_004, ...ADR_005, ...AUDIT_FOLLOWUPS];
      console.log(`would create up to ${LABELS.length} labels, 2 projects, ${all.length} issues`);
      for (const i of all) console.log(`  [${i.stateName.padEnd(11)}] ${i.title}`);
      return;
    }

    // 1. Labels
    const labelMap = new Map<string, string>();
    for (const l of existingLabels) labelMap.set(l.name.toLowerCase(), l.id);
    for (const spec of LABELS) {
      if (labelMap.has(spec.name.toLowerCase())) {
        console.log(`label exists: ${spec.name}`);
        continue;
      }
      const created = await createLabel(team.id, spec.name, spec.color);
      labelMap.set(created.name.toLowerCase(), created.id);
      console.log(`label created: ${created.name}`);
    }

    // 2. Projects
    const projectMap = new Map<string, string>();
    for (const p of existingProjects) projectMap.set(p.name, p.id);
    const projects = [
      { name: "ADR-004: Cognitive Engine verdict cache", description: "Verdict-cache feature for the Cognitive Engine. Phase 5A: schema. 5B: read path. 5C: write-after hook." },
      { name: "ADR-005: Workspace bootstrap (pnpm + turborepo)", description: "Migrate the repo to PNPM workspaces + Turborepo. Phase 1 is tooling-only; Phase 2 extracts packages/shared. ADR transitions Proposed → Accepted when Phase 1 + 2 land green." },
    ];
    for (const p of projects) {
      if (projectMap.has(p.name)) {
        console.log(`project exists: ${p.name}`);
        continue;
      }
      const created = await createProject(team.id, p.name, p.description);
      projectMap.set(created.name, created.id);
      console.log(`project created: ${created.name}`);
    }

    // 3. Issues
    const existingTitles = new Set(existingIssues.map((i) => i.title));
    const all = [
      ...HOMEWORK.map((i) => ({ ...i, group: "homework" })),
      ...ADR_004.map((i) => ({ ...i, group: "adr-004" })),
      ...ADR_005.map((i) => ({ ...i, group: "adr-005" })),
      ...AUDIT_FOLLOWUPS.map((i) => ({ ...i, group: "audit" })),
    ];

    const created: Array<{ identifier: string; title: string; group: string }> = [];
    const skipped: string[] = [];
    for (const spec of all) {
      if (existingTitles.has(spec.title)) {
        skipped.push(spec.title);
        continue;
      }
      const state = pickState(states, spec.stateName);
      const labelIds = spec.labelNames.map((n) => {
        const id = labelMap.get(n.toLowerCase());
        if (!id) throw new Error(`label not found: ${n}`);
        return id;
      });
      const projectId = spec.projectName ? projectMap.get(spec.projectName) : undefined;
      if (spec.projectName && !projectId) throw new Error(`project not found: ${spec.projectName}`);
      const issue = await createIssue({
        teamId: team.id,
        title: spec.title,
        description: spec.description,
        stateId: state.id,
        labelIds,
        projectId,
        dueDate: spec.dueDate,
      });
      created.push({ identifier: issue.identifier, title: issue.title, group: spec.group });
      console.log(`  + ${issue.identifier}  ${issue.title}`);
    }

    console.log(`\ncreated ${created.length} issues, skipped ${skipped.length} (already existed)`);
    if (skipped.length) for (const t of skipped) console.log(`  ~ skip: ${t}`);
  } catch (err) {
    if (err instanceof LinearAPIError) {
      console.error(`linear error (status=${err.httpStatus ?? "n/a"}): ${err.message}`);
      if (err.graphqlErrors) for (const ge of err.graphqlErrors) console.error(`  - ${ge.message}`);
    } else {
      console.error("seed failed:", err);
    }
    process.exit(1);
  }
}

main();
