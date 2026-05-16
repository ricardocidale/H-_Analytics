---
title: Agent Autonomy Strategy — Managed Agents, Dreaming, and Multi-Provider Routing
date: 2026-05-16
category: architecture-patterns
module: agent-autonomy
problem_type: architecture_pattern
component: assistant
severity: high
applies_when:
  - Adding self-improvement or scheduled learning to an existing multi-agent system
  - Evaluating Anthropic Managed Agents for an app with hand-rolled agents already in production
  - Designing multi-provider AI cost optimization without breaking existing agent contracts
  - Building data source discovery agents that require founder-review gating
tags:
  - managed-agents
  - dreaming
  - model-routing
  - agent-autonomy
  - cost-optimization
  - multi-provider
  - outcomes-gate
  - fabio
---

# Agent Autonomy Strategy — Managed Agents, Dreaming, and Multi-Provider Routing

## Context

H+ Analytics has a rich hand-rolled multi-agent architecture (Costantino, Pietro, Iris, Vito,
Gustavo/Swarm, Rebecca) built before Anthropic's Managed Agents + Dreaming capabilities shipped
(April–May 2026). The question was how to adopt these new capabilities without:

1. Migrating working agents into a platform that is currently Claude-only (breaking multi-provider routing)
2. Over-investing in speculative infrastructure before the investor demo milestone
3. Losing the institutional knowledge accumulated across Gustavo synthesis sessions

Two decisions crystallized the strategy:

- **Do not migrate existing working agents.** The Managed Agents API (`managed-agents-2026-04-01`
  header, Sessions API, SSE events) is Claude-only. Migrating would break the planned multi-provider
  routing architecture (Fabio). Managed Agents is the right primitive for *new* long-running async
  agents where cloud hosting and session management are the bottleneck.
- **Use Dreaming for memory, not model fine-tuning.** Dreaming (research preview, shipped May 6 2026)
  reviews past sessions and curates memory as plain-text playbooks. It does NOT modify model weights.
  Use `review-before-land` mode — the founder reviews curated playbooks before they go active.

## Guidance

### Four new capabilities — sequenced by value

**1. Fabio — Model Router Specialist** (highest ROI, build first)

Fabio is a lightweight RouteLLM-style classifier that routes each task type to the cheapest viable
model. The routing table lives in `admin_resources` rows (`kind = 'llm_slot'`) so the founder can
tune it without a deploy. The gateway is LiteLLM or Bifrost (multi-provider, drop-in OpenAI-compatible).

May 2026 routing matrix (pricing as of this date — re-validate quarterly):

| Task type | Model | Why |
|---|---|---|
| PDF / OCR | Mistral OCR 3 | $2 flat per 1K pages, purpose-built |
| Structured extraction | Gemini 3.1 Flash | ~6x cheaper than Sonnet |
| Code / bulk text tasks | DeepSeek V4-Flash | 10–20x cheaper, MIT license |
| Multilingual (Colombia / Spain) | Qwen 3 32B | ~10x cheaper, strong in Spanish |
| Real-time market research | Grok 4.20 Mini | Native web grounding, Harper sub-agent for fact verification |
| Financial reasoning / synthesis | Claude Sonnet 4.6 | Keep here — quality matters |
| Financial engine authoring | Claude Opus 4.6 | CLAUDE.md §9 — non-negotiable |

Fabio is NOT an LLM — it is a deterministic classifier (Minion tier). It reads the incoming
task's `type` field from the orchestrator envelope and returns the routed model slug. The slug
maps to an `admin_resources` row; Fabio never hardcodes model names.

**2. Dreaming on Gustavo** (schedule after investor demo)

After each Gustavo synthesis session, write a structured memory entry to a Managed Agent memory
store. Fields: property_type, geography, data_sources_used, judgments_made, confidence_scores.

Nightly Dreaming reviews the last 30 synthesis sessions and curates playbooks:
- Recurring bad data source judgments (e.g., "Zillow data was consistently wrong for Medellín")
- Synthesis patterns that produced high-confidence outputs
- Geographic expertise notes

Set `mode: review-before-land` — every curated playbook lands in a review queue. The founder
approves before Gustavo sees it in its next session context. This prevents hallucinated playbooks
from compounding.

**3. Outcomes gate** (pair with Dreaming, same sprint)

A separate Claude Sonnet 4.6 grader evaluates each Gustavo synthesis output against a rubric
before the result is surfaced in the UI. The grader runs in its own context window with no access
to Gustavo's conversation history — it grades the output, not the reasoning.

Rubric (minimum for passing):
- At least one specific numeric figure (not a range) per major assumption
- Source citation for each numeric claim
- Named comparable market (not "comparable resort markets")
- Confidence expressed as a numeric range (e.g., "8.5%–10.2%") not a word ("moderate")

One correction cycle allowed: if grader returns FAIL, Gustavo gets the rubric violations and
revises once. Second FAIL → surface output with a visible "analyst review pending" badge rather
than blocking delivery entirely.

**4. Lorenzo — Data Source Discovery Agent** (longer horizon, foundation work)

Lorenzo is a native Managed Agent: long-running, async, cloud-hosted session. Two trigger conditions:
- Weekly scheduled run: discover new hospitality data sources globally
- Geography trigger: when a new property geography is added, Lorenzo runs within 24h

Lorenzo proposes data source additions (name, URL, coverage, cost, quality signal). Every
proposal requires explicit founder approval before the source is added to `admin_resources`.
Lorenzo never auto-adds. Lorenzo's memory store accumulates validated source quality judgments
across runs so it improves without relearning from scratch.

Lorenzo request access: `claude.com/form/claude-managed-agents` (research preview as of 2026-05-16).

### What NOT to adopt (yet)

- **Multi-agent orchestration research preview**: The lead-agent → specialist subagents model with
  independent models and shared filesystems. H+ already has this hand-rolled. No migration value.
- **RouteLLM open-source library**: Good research paper (ICLR 2025, 85% cost reduction at 95%
  quality), but requires training a classifier on your own eval data. Fabio's deterministic routing
  table is simpler and sufficient for this app's task diversity.
- **Migrating Rebecca to Managed Agents**: Rebecca has 104 tools and a hand-tuned system prompt.
  Migration risk is high and the reward (cloud hosting) is low — Rebecca already runs embedded in
  the api-server. Revisit if the api-server becomes a bottleneck.

## Why This Matters

**Token cost reduction**: A properly tuned Fabio routing table targets 30–50% reduction on total
AI spend. At current volume, structured extraction and OCR tasks are the biggest wins — both
route away from frontier models.

**Compound research quality**: Gustavo currently loses all synthesis context between sessions.
Dreaming creates a memory layer that compounds across sessions — geographic expertise accumulates,
bad data sources are flagged, patterns are recognized. Without this, every Gustavo synthesis
starts from scratch.

**Founder autonomy on data sources**: The founder currently IS the expert on which data sources
exist for which geographies. Lorenzo offloads that discovery loop. The review-before-land gate
ensures the founder stays in control of what actually goes live.

**Rewrite tax reduction**: The largest single cost in H+ development is the CC ↔ Replit rewrite
cycle (~50% of total dev cost). The master plan tracks Replit graduation as Track 4. The agent
autonomy track is sequenced after the investor demo specifically to avoid adding infrastructure
complexity while the demo milestone is in-flight.

## When to Apply

- When adding a new agent that is long-running, async, and doesn't need to call non-Claude APIs
  → use Managed Agents
- When a synthesis agent has no memory across sessions and makes the same data quality mistakes
  repeatedly → add Dreaming with review-before-land
- When output quality is inconsistent and the user sees garbage answers in some sessions
  → add an Outcomes gate grader
- When routing all tasks through one frontier model and the token bill is growing
  → build Fabio with a routing table in admin_resources
- When the founder is the single expert on geography-specific data sources
  → build Lorenzo with explicit proposal-review gating

## Examples

**Fabio routing envelope (task dispatch layer):**

```typescript
// Orchestrator builds this; Fabio reads task.type and returns model slug
interface FabioTaskEnvelope {
  task_type: 'pdf_ocr' | 'structured_extraction' | 'synthesis' | 'code' | 'multilingual' | 'market_research';
  payload: unknown;
}

// Fabio returns — model slug comes from admin_resources row, never hardcoded
interface FabioRouting {
  model_slug: string;       // e.g. "mistral-ocr-3", "gemini-flash-3-1"
  admin_resources_id: string;
  rationale: string;
}
```

**Dreaming memory entry (written after each Gustavo synthesis):**

```json
{
  "session_date": "2026-05-16",
  "property_type": "boutique-resort",
  "geography": "medellin-colombia",
  "data_sources_used": ["daloopa", "cotelco", "perplexity"],
  "judgments_made": {
    "exit_cap_rate": { "value": 0.085, "confidence": 0.82, "source": "cotelco-2025" },
    "adr_growth": { "value": 0.045, "confidence": 0.71, "source": "perplexity-synthesis" }
  },
  "post_session_grader_result": "PASS"
}
```

**Lorenzo trigger conditions:**

```
Weekly: every Monday 02:00 UTC — discover new global hospitality data sources
Geography trigger: fires within 24h when admin adds a property with a new country code
Lorenzo output: proposal object (name, url, coverage_geographies, cost_tier, quality_signal, sample_data_url)
Gate: ALL proposals require explicit founder APPROVE or REJECT before commit to admin_resources
```

## Related

- `docs/brainstorms/agent-autonomy-managed-agents-dreaming-requirements.md` — full requirements doc
- `docs/plans/master-plan-2026-05-16.md` — Track 3 sequencing and Track 4 Replit graduation
- `docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md` — DI pattern for agent pipelines
- `docs/solutions/architecture-patterns/mcp-integration-surfaces-production-vs-claude-code-2026-05-08.md` — MCP routing decisions
- `docs/solutions/architecture-patterns/rebecca-agent-native-architecture-2026-05-09.md` — Rebecca 104-tool architecture
- CLAUDE.md §9 — financial engine authoring authority (Opus only, protected surface)
- CLAUDE.md §12 — model cost optimization guidance
