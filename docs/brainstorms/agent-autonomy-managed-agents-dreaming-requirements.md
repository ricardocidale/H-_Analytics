# Agent Autonomy, Managed Agents & Dreaming — Requirements

**Brainstorm date:** 2026-05-16
**Status:** draft — ready for planning
**Plan file:** TBD (split into phases below)

---

## Problem statement

H+ Analytics requires the founder to be the expert on data sources, model selection, and output quality verification — all things autonomous agents should handle. Additionally:

- Research sessions start from zero every time; no accumulation of what worked
- AI token costs are disproportionate because every task runs on the same high-cost models regardless of task type
- Exported PDFs, PPTX, DOC files are served without the app ever checking what they look like
- The app cannot discover new hospitality data sources autonomously
- Rebecca can't do everything the UI can do

---

## What this document covers

Four net-new capabilities agreed in the 2026-05-16 brainstorm. These are **Phase 2** items — none ships before v1 reaches investors. The v1 milestone and the master plan audit (see §"Not in this document") are the prerequisite.

---

## Capability 1 — Fabio: Model Router Specialist

### What it does

A lightweight routing layer that classifies each LLM call by task type and selects the cheapest model that meets quality requirements for that class. Fabio is a **Specialist** (cross-app, used across all pipelines).

### Task → model routing matrix (initial)

| Task type | Recommended model | Approx. cost vs Claude Sonnet | Notes |
|---|---|---|---|
| PDF parsing / OCR | Mistral OCR 3 | $2/1K pages flat | Purpose-built; outperforms GPT-4V on doc tasks |
| Structured extraction / bulk classification | Gemini 3.1 Flash | ~6× cheaper | Already used as Analyst A; extend to all extraction |
| Code generation / mechanical tasks | DeepSeek V4-Flash | 10–20× cheaper | MIT license; self-host viable at >15M tokens/month |
| Multilingual data (Colombia, Spain, LatAm) | Qwen 3 (32B) | ~10× cheaper | Strong multilingual reasoning |
| Real-time market research | Grok 4.20 Mini | ~$0.20/$0.50 per 1M | Native web grounding; Harper sub-agent does fact verification |
| Financial reasoning / synthesis | Claude Sonnet 4.6 | baseline | Keep here; don't cut on trust-critical paths |
| Complex multi-step / engine work | Claude Opus 4.6 | ~1.5× Sonnet (post price drop) | Financial engine only per §9 CLAUDE.md |

### Architecture

- Fabio sits in front of all `callLlm()` and direct SDK calls
- Task type is declared by the calling agent/specialist (not inferred by Fabio)
- Routing table lives in `admin_resources` rows (kind = `llm_slot`) — admin-editable, no redeploy required
- Fabio reads the table at call time; falls back to Claude Sonnet if no route configured for a task type
- Cost logging per task type surfaces in the Admin panel so the founder can tune

### Infrastructure note

Anthropic's Agent SDK is Claude-only at the transport layer. Multi-provider routing requires an AI gateway:
- **LiteLLM** (open source, most mature) or **Bifrost** (open source, 20+ providers) as the gateway layer
- Both translate provider API formats transparently
- The gateway becomes the single interface; Fabio calls the gateway, not providers directly

### Expected savings

RouteLLM research (ICLR 2025) shows 85% cost reduction at 95% quality with accurate task classification. Conservative estimate for H+ Analytics: **30–50% reduction in monthly AI token spend** once Mistral OCR and DeepSeek are routing bulk extraction and code tasks.

---

## Capability 2 — Dreaming on the research orchestrator

### What it does

Adds Anthropic's managed memory store to Gustavo's research pipeline. After each research session, outcomes are written to memory. The dreaming process (scheduled, Anthropic-managed) reviews sessions, extracts patterns, and curates playbooks for future sessions.

### What dreaming learns in this domain

- Which data sources (Exa vs Perplexity vs CoStar) produce the most accurate results by property type and geography
- Which market segments consistently produce over-estimated ADR (e.g., LatAm estimates arriving 15–20% high)
- Which analyst recommendations users consistently override, and in which direction
- Which exit cap rate estimates get corrected by users at confirmation time

### Architecture

- Gustavo writes session outcomes to `client.beta.memory_stores` after each synthesis
- Dreaming runs on the stored sessions nightly (research preview — access request required)
- Memory is read at synthesis start: Gustavo prefixes the synthesis prompt with the relevant playbook entries
- Control mode: **review before land** initially — the founder sees proposed memory updates before they take effect

### Access requirement

Dreaming is in research preview as of May 2026. Access request: [https://claude.com/form/claude-managed-agents](https://claude.com/form/claude-managed-agents)

### No migration required

The existing Analyst A + B + Synthesis pipeline is unchanged. Dreaming is purely additive — a memory write at the end of each session and a memory read at the start.

---

## Capability 3 — Outcomes gate on analyst research

### What it does

Before research results surface to the user, a separate grader evaluates the output against a defined rubric. The grader runs in its own context window (no bias from the analyst's reasoning). If the output fails, the analyst self-corrects once before delivery.

### Rubric (initial)

A valid research output must:
- Include at least 3 specific data points with source citations
- Include a numeric range (not a point estimate) for each financial assumption
- Not contain hedging language without an accompanying quantified range ("it varies" without numbers = fail)
- Name the primary comparable market and explain the selection

### Architecture

- Outcomes is in public beta: available via `client.beta.agents` with the `managed-agents-2026-04-01` header
- The grader is a separate Claude call (Sonnet) that receives: the rubric + the analyst output
- If grader fails the output, a correction prompt is sent to the analyst with specific gaps identified
- Maximum one correction cycle per session (avoid infinite loops)
- Grader result is logged to `research_sessions` table for quality trending

### Expected improvement

Anthropic reports up to +10 task success points over standard prompting; file generation improved +8–10%. For H+ Analytics, the primary gain is eliminating outputs that pass syntactically but fail the user's actual question — currently invisible to the system.

---

## Capability 4 — Lorenzo: Data Source Discovery Agent

### What it does

A native Managed Agent whose sole job is discovering, validating, and proposing new hospitality data sources. Lorenzo runs autonomously, periodically, without human prompting.

### Trigger conditions

- Weekly scheduled run
- Triggered by a new property geography being added (e.g., first Spain property → Lorenzo runs a Spain hospitality data survey)
- Triggered by a data source health failure in Costantino (source went dead → Lorenzo finds a replacement)

### What Lorenzo does per cycle

1. Surveys the web for hospitality data APIs, research firms, and datasets relevant to active property geographies
2. Validates each candidate: tests the API/URL, checks data freshness, evaluates geographic coverage
3. Compares against existing `admin_resources` rows to avoid duplicates
4. Proposes additions as draft `admin_resources` rows with quality assessment
5. Does NOT auto-merge — proposals require founder review and approval before activation

### What dreaming learns for Lorenzo

- Which discovery patterns (search queries, source categories) find validated sources vs noise
- Which source categories have the highest hit rate by geography
- Which proposed sources the founder approves vs rejects (and why, if noted)

### Architecture

- Built as a native Anthropic Managed Agent (model, system prompt, tools, MCP servers defined once)
- Tools: web search, fetch, code execution (to test APIs), `admin_resources` read/write (proposals only)
- Session history persisted server-side by Anthropic
- Dreaming watches Lorenzo cycles and refines the playbook

### Naming convention

Lorenzo follows CLAUDE.md §10: Italian name, cross-app specialist, single name (no NN suffix). Role: "Data Source Discovery Agent."

---

## Not in this document

The following are out of scope for this requirements doc and require separate treatment:

**Master plan audit (prerequisite for everything above):**
The app has unknown-status functionality across exports, IRR correctness, photo albums, scenario bank, scenario sharing, and Rebecca parity. A full audit of every functional bucket — pass/fail status + spec for each gap — is the prerequisite to making the phase decisions above. This is a separate CC session, not a planning unit.

**Export / slide factory quality:**
The "app is blind to what it exports" problem requires a vision-based verification agent. This is a separate requirements doc. The architecture is: render → vision agent reviews output against rubric → self-correct or flag before delivery. Whether this requires rebuilding the render pipeline (HTML→PDF structural limitations) or just adding verification is unknown until the audit is done.

**Rebecca on Managed Agents:**
Rebecca's migration to Anthropic Managed Agents infrastructure is Phase 3. The parity map gaps (⚠️ items in `docs/discipline/agent-native-parity-map.md`) should be closed first via existing architecture.

**Full migration of Costantino/Pietro to Managed Agents:**
These agents work. Migration would require rewriting custom tool dispatchers for infrastructure benefit only. Defer until there is a specific failure mode that managed infrastructure would fix.

**Design audit agent:**
Vision-based continuous design auditor (screenshots → compares against design tokens → files violations). Real capability gap; lower priority than shipping v1.

---

## Cost model

| Capability | Incremental token cost | Compounding value |
|---|---|---|
| Fabio (model router) | Net negative — saves 30–50% | High: compounds on every call |
| Dreaming | Low: scheduled, runs on accumulated sessions | High: improves research quality per session |
| Outcomes | Low: one extra Sonnet call per research session | Medium: reduces low-quality outputs reaching users |
| Lorenzo | Low: weekly scheduled; short cycles | Medium: compounds as source catalog grows |

All four are net-positive or cost-neutral on a per-session basis once the routing savings are realized.

---

## Naming registry additions

| Name | Role | Type | Format |
|---|---|---|---|
| Fabio | Model Router Specialist | Specialist | Single name |
| Lorenzo | Data Source Discovery Agent | Specialist | Single name |

Add both to `.agents/skills/slide-factory/SKILL.md` roster per CLAUDE.md §10.

---

## Definition of done (Phase 2)

1. Fabio routes at least 5 distinct task types to non-Sonnet models; cost per session measurably reduced
2. Gustavo writes session outcomes to managed memory store after each synthesis
3. Dreaming access obtained; review-before-land mode configured
4. Outcomes gate active on all research sessions; grader logs visible in admin
5. Lorenzo runs first autonomous cycle; proposes at least one valid new source
6. Routing table visible and editable in Admin → Model Defaults panel
