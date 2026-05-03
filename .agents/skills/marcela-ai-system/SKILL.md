---
name: marcela-ai-system
description: "H+ AI agent architecture: Marcela voice assistant (ElevenLabs/Convai), dual-channel tool system (client UI tools + server data tools), knowledge base, market research agentic workflow (Claude 3.5 Sonnet + tool-augmented research), research value extraction, ICP-driven company research, research freshness 30-day cycle. Load when working on AI agents, research pipeline, or Marcela configuration."
---

## Marcela's Role

Hospitality finance specialist AI that assists with navigation, data retrieval, and contextual analysis.

- She is NOT a calculator — she calls deterministic engine tools for any financial computation
- Voice-first interface via ElevenLabs/Convai WebSocket
- Also has a text chat mode: Rebecca (`artifacts/api-server/src/routes/rebecca.ts`)

## Architecture

- Built on ElevenLabs Convai for voice-to-voice interaction
- Configurable LLM backend: default Gemini 2.0 Flash via ElevenLabs; Claude 3.5 Sonnet for research tasks
- Admin configuration: LLM provider selection, knowledge base rebuild triggers, Convai agent configuration, voice settings

## Dual-Channel Tool System

**Client-side tools** (execute in the browser, modify UI state):
- `navigateToPage`
- `showPropertyDetails`
- `openPropertyEditor`
- `startGuidedTour`

**Server-side webhook tools** (data retrieval, called via HTTP from ElevenLabs):
- `getProperties`
- `getPropertyDetails`
- `getPortfolioSummary`
- `getGlobalAssumptions`

## Knowledge Base Architecture

**Static KB**
- Markdown reference documents covering 18+ hospitality finance topics

**Dynamic live-data documents**
- Current global assumptions
- Property portfolio details
- User role context

Compiled and synced to ElevenLabs for RAG (Retrieval-Augmented Generation). Admin can trigger KB rebuild from the admin panel.

## Market Research Agentic Workflow

Primary researcher: Anthropic Claude 3.5 Sonnet with tool-augmented research.

**Research modules:**
1. **Competitive Landscape** — 4–6 comps with room counts and ADRs from live market data
2. **Operating Cost Benchmarks** — USALI-aligned rates from industry sources
3. **Local Economics** — CPI and SOFR/Prime from FRED/BLS

**Tool-augmented consistency:** Marcela calls `compute_adr_projection` and `compute_occupancy_ramp` during research so her suggested values are consistent with the portal's own math — not hallucinated.

## Research Value Extraction

- Research results parsed through `research-value-extractor.ts`
- Output: structured financial assumptions
- "Apply Research" dialog: user can accept / modify / reject each suggested value individually
- Accepted values update the property's assumptions in the database

## ICP-Driven Company Research

- ICP physical parameters, amenity priorities, financial targets, and location definitions are formatted into system prompts
- Research is guided toward finding acquisition candidates matching the ICP

## Research Freshness

- 30-day compulsory refresh cycle with persistent tracking
- Research status indicators in sidebar: green/red freshness dots
- Research runs stored in `research_runs` table for history

## AI Specialist Personas

CRITICAL: Always use personal names for AI specialists — never role strings in user-facing copy.

Named individuals: Gaspar, Ana, Bia, Cecília, Daniela, Eloá, Fernanda, Giovanna, Helena

See the `specialist-persona-naming` skill for the full anti-pattern list.

## Rebecca

- Secondary text-based AI assistant (complementary to Marcela's voice-first approach)
- Located at `artifacts/api-server/src/routes/rebecca.ts`

## Related Skills

- integrations-infrastructure
- api-backend-contract
- specialist-persona-naming
- hbg-business-model
