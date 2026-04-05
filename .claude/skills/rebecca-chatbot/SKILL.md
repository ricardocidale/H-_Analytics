---
name: rebecca-chatbot
description: Rebecca — Conversational Intelligence Layer for the research system. Covers Super Conversations, research badge integration, email summaries, Norfolk AI feedback, RAG knowledge architecture, and admin configuration. Load when working on the chat endpoint, Rebecca UI, chatbot configuration, or research explanation flows.
---

# Rebecca Chatbot — Conversational Intelligence Layer

## Purpose

Rebecca is the AI chatbot AND the conversational intelligence layer for the entire research system. She replaces complex tooltips for research explanations and provides "Super Conversations" (trademark Norfolk AI feature) — deep, multi-turn, contextual dialogues about any financial assumption, market benchmark, or research finding. Rebecca knows EVERYTHING about the portfolio.

## Current Architecture

```
Client POST /api/chat { message, history }
  ↓
requireAuth → aiRateLimit(20) → Zod validation
  ↓
Feature gate: global.rebeccaEnabled === true?
  ↓
Build context:
  ├── buildPropertyContext(properties) → property summaries
  ├── Company name, inflation, projection years
  ├── Management fees (base + incentive)
  └── SAFE funding details (tranches, valuation cap, discount rate, interest)
  ↓
Assemble Gemini contents → Return { response: text }
```

## Planned Architecture (Research Intelligence Redesign)

### Rebecca as Research Explainer

Rebecca replaces complex InfoTooltips for research topics. When a user clicks a ResearchBadge:

1. Micro-popover appears: "Ask Rebecca" / "Apply Value" / "View Details"
2. "Ask Rebecca" opens the Rebecca Panel (520px right slide-over)
3. Rebecca receives FULL context: field name, current value, research range, property context pack, comparable set, confidence, relaxation trail
4. Auto-generates first message: "I see you're looking at the [field] for [property]. The research suggests [low]-[high] based on [N] comparable [star]★ [type] properties in [market]..."

### Rebecca Panel UX (520px right slide-over, 100vw mobile)

- Header: Rebecca avatar, name, property/field breadcrumb, close
- Context card (collapsed by default): current value, research range, star rating, comparable set, confidence
- Chat area: markdown + inline charts/tables + source citations
- Input: text input + suggested follow-up chips
- Action bar: "Send Email Summary", "Report to Norfolk AI", "Apply Recommendation"

### Suggested Follow-Up Chips (contextual, change per round)

- Round 1: "Why this range?", "Show comparables", "Impact on NOI", "Historical trends"
- Round 2: "Go deeper on [topic]", "Compare to company defaults", "Send email summary"
- Round 3+: "Report feedback to Norfolk", "Pin my current value", "Apply recommendation"

### Email + Feedback Workflows

- "Send Email Summary": preview modal → styled email template with conversation summary, field context, recommendation, sources → send via Resend → toast confirmation → logged in admin
- "Report to Norfolk AI": feedback form (category: data accuracy, missing source, wrong comparable, suggestion) → auto-includes conversation context → "Submit" → toast → logged in admin

### Rebecca RAG Knowledge (knows EVERYTHING)

Rebecca accesses all research data:
- Pinecone namespaces: research-history, market-reports, knowledge-base, assumption-guidance (NEW)
- SQL live queries: benchmark_snapshots (Tier 0), entity context packs (computed), property financials
- Document corpus: methodology docs, checker manual, ICP definitions, GAAP rules
- Always cites sources inline: "[CBRE 2024 Cap Rate Survey]", "[STR Market Report Q3]"

### Rebecca Admin Section (6 sub-tabs under Admin → AI → Rebecca)

1. **Configuration**: enable/disable, system prompt, model/engine, personality settings
2. **RAG Knowledge**: connected sources, sync status, document counts per namespace, "Rebuild Index"
3. **Email Templates**: explanatory email template, feedback report template, available variables
4. **Conversation Logs**: searchable history, filter by user/property/topic, sentiment
5. **Feedback Reports**: user-submitted feedback routed to Norfolk AI, status tracking
6. **Analytics**: usage metrics, popular topics, satisfaction scores, response times

## Key Files

| File | Purpose |
|------|---------|
| `server/routes/chat.ts` | Chat endpoint — context building, Gemini call, response |
| `server/ai/clients.ts` | Gemini client singleton (`getGeminiClient()`) |
| `server/ai/buildPropertyContext.ts` | Builds property summary text for context injection |
| `server/middleware/rate-limit.ts` | `aiRateLimit()` middleware |

### Planned New Files

| File | Purpose |
|------|---------|
| `client/src/components/rebecca/RebeccaPanel.tsx` | 520px right slide-over chat panel |
| `client/src/components/rebecca/RebeccaContextCard.tsx` | Collapsed context card in panel header |
| `client/src/components/rebecca/RebeccaEmailPreview.tsx` | Email preview modal |
| `client/src/components/rebecca/RebeccaFeedbackForm.tsx` | Feedback to Norfolk AI form |
| `client/src/lib/rebecca-panel-store.ts` | Global panel state (open/close, context injection) |
| `server/routes/rebecca.ts` | Conversations, messages, email, feedback endpoints |
| `server/ai/rebecca-context-builder.ts` | Builds rich context from Entity Context Packs + guidance |

## Feature Gate

Rebecca is disabled by default. Enabled via `global_assumptions.rebeccaEnabled` (boolean).

## Constraints

| Constraint | Value |
|-----------|-------|
| Max message length | 2,000 characters |
| Max history length | 20 messages |
| Rate limit | 20 requests per window |
| Max output tokens | 1,024 (current, may increase for Super Conversations) |
| Model | `gemini-2.5-flash` (configurable via admin) |

## Panel Conflict Resolution

Rebecca Panel (520px) and Guidance Side-Sheet (480px) both open from the right. They are MUTUALLY EXCLUSIVE via a global panel manager with z-index orchestration. Opening one closes the other.

## Related Skills

- `.claude/skills/research/research-intelligence-redesign.md` — Full research redesign spec
- `.claude/skills/research/SKILL.md` — Current research system architecture
- `.claude/skills/admin/SKILL.md` — Admin configuration
- `.claude/skills/market-intelligence/SKILL.md` — Market intelligence pipeline
