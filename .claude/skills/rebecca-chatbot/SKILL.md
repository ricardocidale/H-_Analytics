---
name: rebecca-chatbot
description: Rebecca — Conversational Intelligence Layer for the research system. Covers Super Conversations, research badge integration, email summaries, Norfolk AI feedback, RAG knowledge architecture, and admin configuration. Load when working on the chat endpoint, Rebecca UI, chatbot configuration, or research explanation flows.
---

# Rebecca Chatbot — Conversational Intelligence Layer

## Purpose

Rebecca is the AI chatbot AND the conversational intelligence layer for the entire research system. She replaces complex tooltips for research explanations and provides "Super Conversations" (trademark Norfolk AI feature) — deep, multi-turn, contextual dialogues about any financial assumption, market benchmark, or research finding. Rebecca knows EVERYTHING about the portfolio.

## Current Architecture (T19+T20 IMPLEMENTED)

```
Client POST /api/chat { message, history, fieldContext? }
  ↓
requireAuth → aiRateLimit(20) → Zod validation
  ↓
Feature gate: global.rebeccaEnabled === true?
  ↓
If fieldContext present:
  ├── Validate entity ownership (IDOR prevention)
  │   ├── property: user's portfolio list check
  │   └── company: authUser.companyId match
  ├── buildRebeccaContext(entityType, entityId, fieldKey?, scenarioId?)
  │   ├── buildPropertyContextPack() or buildCompanyContextPack()
  │   ├── Fetch assumption_guidance for fieldKey (if provided)
  │   ├── Format guidance ranges, comparable count, relaxation level
  │   └── Generate autoGreeting message
  └── Inject FOCUSED ENTITY CONTEXT + FIELD-SPECIFIC RESEARCH into system prompt
  ↓
Build base context:
  ├── buildPropertyContext(properties) → property summaries
  ├── Company name, inflation, projection years
  ├── Management fees (base + incentive)
  └── SAFE funding details (tranches, valuation cap, discount rate, interest)
  ↓
Assemble LLM contents → Return { response: text, autoGreeting?: string }
```

### Context Builder (`server/ai/rebecca-context-builder.ts`)

Builds rich context server-side from entity IDs — never trusts client-provided context text.

```typescript
buildRebeccaContext(params: {
  entityType: 'property' | 'company';
  entityId: number;
  fieldKey?: string;
  scenarioId?: number;
}): Promise<{
  contextBlock: string;       // Natural-language context for LLM system prompt
  autoGreeting: string;       // First message Rebecca shows to user
  entityName: string;         // Property or company name
  fieldLabel?: string;        // Human-readable field name
  guidanceRange?: { low: number; mid: number; high: number };
  comparableCount?: number;
  relaxationLevel?: number;
}>
```

Key behaviors:
- 40+ field label mappings with proper format (%, $, raw number)
- Calls `buildPropertyContextPack()` or `buildCompanyContextPack()` for full entity context
- Fetches `assumption_guidance` records for specific field when `fieldKey` provided
- Generates natural-language summary (NOT raw JSON) for LLM consumption
- Auto-greeting references the specific field, current research data, and entity name

### Chat Route Extensions (`server/routes/chat.ts`)

Optional `fieldContext` Zod schema:
```typescript
fieldContext: z.object({
  entityType: z.enum(['property', 'company']),
  entityId: z.number(),
  fieldKey: z.string().optional(),
  scenarioId: z.number().optional(),
}).optional()
```

Security:
- Property ownership: validates `entityId` exists in user's property list
- Company ownership: validates `entityId === authUser.companyId`
- Context rebuilt server-side from IDs — client text never trusted

## Rebecca Panel UX (T19 IMPLEMENTED)

### RebeccaPanel (`client/src/components/rebecca/RebeccaPanel.tsx`)

520px right slide-over panel (100vw on mobile):
- Header: Rebecca avatar, name, property/field breadcrumb, close button
- Context card (collapsed by default via `RebeccaContextCard`): current value, research range, star rating, comparable set, confidence
- Chat area: markdown rendering + message bubbles
- Input: text input + suggested follow-up chips
- Auto-greeting: when opened with field context, sends initial request to get contextual greeting from server

### RebeccaContextCard (`client/src/components/rebecca/RebeccaContextCard.tsx`)

Collapsible card showing field context details when Rebecca is opened from a research badge.

### Panel Conflict Resolution

Rebecca Panel (520px) and Guidance Side-Sheet (480px) both open from the right. They are MUTUALLY EXCLUSIVE via `client/src/lib/panel-manager.ts` (Zustand store) with z-index orchestration. Opening one closes the other.

### Research Badge Integration

`ResearchBadgePopover` → "Ask Rebecca" passes:
- `entityType`, `entityId` (from badge context)
- `fieldKey` (assumption key, e.g. "revenuePerRoom")
- `scenarioId` (current scenario)

Panel manager's `RebeccaContext` interface:
```typescript
interface RebeccaContext {
  entityType: 'property' | 'company';
  entityId: number;
  entityName: string;
  contextSummary: string;
  fieldKey?: string;
  scenarioId?: number;
}
```

## Planned Features (NOT YET IMPLEMENTED)

### T21: Super Conversations (NEXT)
- Persist conversations to `rebecca_conversations` + `rebecca_messages` tables
- Resume conversations by `conversationId`
- Conversation history in LLM context window
- Follow-up chips that change per round:
  - Round 1: "Why this range?", "Show comparables", "Impact on NOI", "Historical trends"
  - Round 2: "Go deeper on [topic]", "Compare to company defaults", "Send email summary"
  - Round 3+: "Report feedback to Norfolk", "Pin my current value", "Apply recommendation"

### T22: Email Summaries
- "Send Email Summary": preview modal → styled email template with conversation summary, field context, recommendation, sources → send via Resend → toast confirmation → logged in admin

### T23: Norfolk AI Feedback / RAG Expansion
- "Report to Norfolk AI": feedback form (category: data accuracy, missing source, wrong comparable, suggestion) → auto-includes conversation context → logged in admin
- Pinecone namespace expansion for assumption-guidance vectors

### T24: Admin Rebecca Section (6 sub-tabs under Admin → AI → Rebecca)
1. **Configuration**: enable/disable, system prompt, model/engine, personality settings
2. **RAG Knowledge**: connected sources, sync status, document counts per namespace, "Rebuild Index"
3. **Email Templates**: explanatory email template, feedback report template, available variables
4. **Conversation Logs**: searchable history, filter by user/property/topic, sentiment
5. **Feedback Reports**: user-submitted feedback routed to Norfolk AI, status tracking
6. **Analytics**: usage metrics, popular topics, satisfaction scores, response times

### Rebecca RAG Knowledge (knows EVERYTHING)
- Pinecone namespaces: research-history, market-reports, knowledge-base, assumption-guidance (NEW)
- SQL live queries: benchmark_snapshots (Tier 0), entity context packs (computed), property financials
- Document corpus: methodology docs, checker manual, ICP definitions, GAAP rules
- Always cites sources inline: "[CBRE 2024 Cap Rate Survey]", "[STR Market Report Q3]"

## Key Files

| File | Purpose | Status |
|------|---------|--------|
| `server/routes/chat.ts` | Chat endpoint — context building, fieldContext schema, IDOR prevention, LLM call | ✅ Implemented |
| `server/ai/rebecca-context-builder.ts` | Builds rich entity+field context from IDs server-side | ✅ Implemented |
| `server/ai/clients.ts` | Gemini client singleton (`getGeminiClient()`) | ✅ Implemented |
| `server/ai/buildPropertyContext.ts` | Builds property summary text for base context injection | ✅ Implemented |
| `server/middleware/rate-limit.ts` | `aiRateLimit()` middleware | ✅ Implemented |
| `client/src/components/rebecca/RebeccaPanel.tsx` | 520px right slide-over chat panel | ✅ Implemented |
| `client/src/components/rebecca/RebeccaContextCard.tsx` | Collapsed context card in panel header | ✅ Implemented |
| `client/src/lib/panel-manager.ts` | Global panel state (open/close, mutual exclusion, RebeccaContext) | ✅ Implemented |
| `client/src/components/research/ResearchBadgePopover.tsx` | 3-option popover passing fieldKey+scenarioId | ✅ Implemented |
| `shared/schema/intelligence-v2.ts` | rebecca_conversations, rebecca_messages tables | ✅ Schema defined |
| `server/storage/index.ts` | Rebecca CRUD operations (IntelligenceV2Storage) | ✅ Storage ready |

### Planned New Files

| File | Purpose | Task |
|------|---------|------|
| `client/src/components/rebecca/RebeccaEmailPreview.tsx` | Email preview modal | T22 |
| `client/src/components/rebecca/RebeccaFeedbackForm.tsx` | Feedback to Norfolk AI form | T23 |
| `server/routes/rebecca.ts` | Conversations, messages, email, feedback endpoints | T21 |

## Feature Gate

Rebecca is disabled by default. Enabled via `global_assumptions.rebeccaEnabled` (boolean).
Feature flag: `REBECCA_V2` (currently OFF) — gates new Super Conversations features.

## Constraints

| Constraint | Value |
|-----------|-------|
| Max message length | 2,000 characters |
| Max history length | 20 messages |
| Rate limit | 20 requests per window |
| Max output tokens | 1,024 (current, may increase for Super Conversations) |
| Model | `gemini-2.5-flash` (configurable via admin) |

## Related Skills

- `.claude/skills/research/research-intelligence-redesign.md` — Full research redesign spec
- `.claude/skills/research/SKILL.md` — Current research system architecture
- `.claude/skills/admin/SKILL.md` — Admin configuration
- `.claude/skills/market-intelligence/SKILL.md` — Market intelligence pipeline
