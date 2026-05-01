# LLM Vendor Roster + Refresh Discipline

> **Binding for every LLM call site in the app.** The roster below is the floor of vendors the app must consider when picking a model for a role. The recommendations are starting points, refreshed quarterly. Pinning to a single vendor without an explicit recommendation table entry is forbidden.

H+ Analytics's intelligence quality depends on vendor breadth — different models surface different patterns. N+1 (parallel multi-model synthesis) is the architectural commitment to that breadth. This rule names which vendors must be on the roster, who is currently recommended for which role, and how the roster stays current.

## Vendor roster (refresh quarterly)

The app must support — via the Resources control plane Models registry (ADR-006) — model resources from at least these vendors:

| Vendor | Tier | Why on the roster |
|---|---|---|
| **Anthropic** (Claude) | Tier-1 always | Strongest reasoning + persona consistency; default for synthesis + market panel |
| **Google** (Gemini) | Tier-1 always | Cost-efficient for high-volume quantitative work; multimodal native |
| **OpenAI** (GPT + o-series) | Tier-1 always | Largest tooling ecosystem; reasoning models for complex synthesis |
| **xAI** (Grok) | Tier-1 desired | Real-time data access (X integration) for market sentiment dimensions |
| **DeepSeek** (V3 / R1) | Tier-1 desired | Cost-strong reasoning; alternative when Claude rate-limits or costs bite |
| **Mistral** (Large) | Tier-2 optional | European data residency + multilingual coverage |
| **Cohere** (Command R+) | Tier-2 optional | RAG-native; alternative for citation-heavy work |
| **Meta Llama** (via Groq / Together / Fireworks) | Tier-2 optional | Open-weight escape hatch; low-cost for non-critical paths |

"Tier-1 always" = at least one model resource in `admin_resources` from this vendor.
"Tier-1 desired" = wired when contracted (Grok needs X API access; DeepSeek needs API key).
"Tier-2 optional" = wire only when a Specialist case demands it.

## Per-role recommendation matrix

Refreshed 2026-04-25. Each role names a primary + at least two alternatives across vendors:

| Role | Primary | Alternatives | Notes |
|---|---|---|---|
| **Synthesis** (Opus tier — verdict-final) | Claude Opus 4.7 | DeepSeek-R1, Gemini 2.5 Pro, GPT-5 thinking | Highest accuracy + persona discipline; cost is justified |
| **Market panel** (Sonnet tier — qualitative) | Claude Sonnet 4.6 | GPT-5, Grok-3, DeepSeek-V3 | Market reasoning + cited evidence |
| **Quantitative panel** (Flash tier — numeric) | Gemini 2.5 Flash | Claude Haiku 4.5, Grok-3-mini | Fast, cheap, strong at numeric extraction |
| **Prompt Engineer pre-stage** | Claude Sonnet 4.6 | Gemini 2.5 Flash, GPT-5-mini | Structured output reliability matters |
| **Voice render** | Claude Haiku 4.5 | Gemini 2.5 Flash, Grok-3-mini | Lightweight; persona consistency matters |
| **Embedding (RAG)** | Voyage-3 | OpenAI text-embedding-3-large, Cohere embed v3 | Quality-cost tradeoff |
| **Image generation** | Gemini 2.5 Image | OpenAI gpt-image-1 (fallback) | Property hero renders |

A Specialist that picks a model OUTSIDE this matrix must justify in PR description (e.g. "this Specialist needs structured-output mode that only OpenAI offers in 2026-04 — alternatives flagged for re-eval next refresh").

## Refresh discipline

The roster is **stale** if older than 90 days. Quarterly refresh tasks:

1. **Catalog audit** — for each vendor row above, confirm at least one model resource exists in `admin_resources` and the model id is current (vendors deprecate IDs).
2. **Recommendation review** — re-rank primary + alternatives based on the last 90 days of usage telemetry (latency, cost-per-call, failure rate). Update this rule's matrix table in the same commit.
3. **New entrants** — if a vendor publishes a new flagship model, add a model resource and consider it for the relevant role. New entrants are NOT promoted to "primary" without at least 2 weeks of A/B observation.
4. **Deprecations** — remove model resources for IDs that vendors have retired. Sweep call sites for any pinned references.

Each refresh produces an explicit commit (`chore(llm-roster): Q3 2026 refresh`) — no silent drift.

## Routing policies (cross-cutting)

Beyond per-role pinning, the app supports vendor-failover routing for cost + availability:

- **Failover order** — if primary vendor is rate-limited or down, fall through to the next alternative in the matrix.
- **Cost ceiling per Specialist** — `specialistConfigs.workflowOverrides.dailyTokenBudget` (existing) caps spend.
- **Latency ceiling per role** — voice-render must return <2s; quantitative panel <8s; synthesis can take up to 20s.
- **Persona discipline** — voice-render MUST stay on Anthropic family (persona consistency is non-negotiable). Other roles can rotate freely.

The Vercel AI Gateway (or equivalent gateway) is the recommended routing layer when failover gets complex; pinning to vendor SDKs is acceptable for single-primary roles.

## Forbidden patterns

- **Vendor-pinned hardcoded model IDs** in code outside `shared/constants.ts` or the `admin_resources` Models registry. Models registry is the canonical edit surface.
- **Single-vendor architectures.** Even if Anthropic is the primary across every role, the registry MUST list at least 2 vendors so a vendor outage does not bring the app down.
- **Silent vendor swap** — changing a model resource's vendor without a roster-refresh commit + telemetry note + PR review.
- **Skipping persona for cost** — Voice render NEVER moves off the Anthropic family for cost reasons. Find the savings elsewhere.
- **Self-hosted-only deployments** — Llama-via-Groq is fine as an alternative; making it the only path forfeits the breadth this rule exists to preserve.

## Verifiability

`tests/proof/llm-roster.test.ts` (to be authored at the next refresh) asserts:
- Every "Tier-1 always" vendor row has ≥1 active model resource in `admin_resources`.
- Every role in the matrix has ≥1 model resource matching the primary.
- No code path imports a hardcoded model ID outside the canonical files.

Until the proof test ships, enforcement is at PR review against this rule.

## Cross-references

- ADR-006 — Resources control plane (Models registry is canonical)
- ADR-007 — Specialist Tier-1 Graduation (uses these recommendations)
- `.claude/rules/specialist-intelligence-bar.md` — requirement 7 (vendor breadth)
- `.claude/skills/integrations/SKILL.md` — current vendor SDK integrations
- Memory `llm_vendor_roster_and_prompt_engineer.md` — the why + how-to-apply context
