---
name: rebecca-chatbot
description: Rebecca — the sole AI assistant and conversational intelligence layer. Covers Super Conversations, context injection, email summaries, feedback, RAG knowledge architecture (Pinecone maximization), and admin configuration. Load when working on the chat endpoint, Rebecca UI, chatbot configuration, or research explanation flows. IMPORTANT — "Marcela" is never used; the AI assistant is always "Rebecca."
---

# Rebecca Chatbot — Conversational Intelligence Layer

## Critical Rule

> **The AI assistant is ALWAYS "Rebecca."** If the user says "Marcela," they mean Rebecca. Marcela does not exist in this application. Never introduce Marcela references anywhere.

## Purpose

Rebecca is the AI chatbot AND the conversational intelligence layer for the entire research system. She replaces complex tooltips for research explanations and provides "Super Conversations" — deep, multi-turn, contextual dialogues about any financial assumption, market benchmark, or research finding. Rebecca knows EVERYTHING about the portfolio via RAG retrieval across multiple Pinecone namespaces.

## Architecture (T19–T23 IMPLEMENTED)

```
Client POST /api/chat { message, history, fieldContext?, conversationId?, newConversation? }
  ↓
requireAuth → aiRateLimit(20) → Zod validation
  ↓
Feature gate: global.rebeccaEnabled === true?
  ↓
Conversation resolution:
  ├── conversationId provided? Validate ownership + context match
  ├── newConversation? Force-create fresh thread
  └── Otherwise: getOrCreateConversation(userId, contextType, contextKey)
  ↓
Load DB history: getRebeccaMessages(conversationId, limit=20) → most recent N
  ↓
Persist user message to rebecca_messages
  ↓
Build context layers (all parallel where possible):
  ├── Portfolio context: buildPropertyContext(properties) + company/funding
  ├── Document context: retrieveDocumentContext(message, propertyId, topK=3)
  ├── RAG context: retrieveRelevantChunks(message, 4) + multiNamespaceQuery(research-history, assumption-guidance, topK=4)
  └── Field context (if fieldContext present):
      ├── Validate entity ownership (IDOR prevention)
      ├── buildRebeccaContext(entityType, entityId, fieldKey?, scenarioId?)
      └── Inject FOCUSED ENTITY CONTEXT + FIELD-SPECIFIC RESEARCH
  ↓
Assemble system prompt: base + portfolio + field + RAG + documents
  ↓
LLM call (Gemini/Perplexity based on engine setting)
  ↓
Persist assistant message → Generate follow-up chips
  ↓
Return { response, conversationId, suggestedChips, autoGreeting? }
```

## Pinecone RAG Architecture — MAXIMIZE USAGE

Rebecca's intelligence depends on comprehensive Pinecone retrieval. All 5 namespaces MUST be leveraged:

### Namespaces (Index: `lb-hospitality`)

| Namespace | Purpose | Indexed By | Key Metadata Fields |
|-----------|---------|-----------|-------------------|
| `knowledge-base` | Static methodology docs, GAAP rules, USALI, ICP definitions | `indexKnowledgeBase()` at startup | `title`, `content`, `source`, `category` |
| `research-history` | Every completed research result | `indexResearchResult()` after research | `summary`, `location`, `propertyType`, `type`, `completedAt` |
| `assumption-guidance` | Historic assumption ranges by market/property type | `indexAssumptionGuidance()` after guidance computation | `assumptionKey`, `valueLow/Mid/High`, `confidence`, `reasoning`, `location`, `propertyType` |
| `comparables` | Benchmark snapshots (ADR, Occupancy, etc.) | `indexBenchmarkSnapshot()` | Market-specific benchmark data |
| `documents` | Extracted text from uploaded property documents | `indexDocumentExtraction()` | `content`, `documentType`, `propertyName`, `propertyId` |

### Key Pinecone Service Methods (`server/ai/pinecone-service.ts`)

```typescript
queryChunks(namespace, query, topK=8): Promise<QueryMatch[]>
multiNamespaceQuery(query, namespaces[], topK=5): Promise<MultiNamespaceMatch[]>
upsertChunks(namespace, chunks[]): Promise<void>
retrieveSimilarResearch(params): Promise<ResearchMatch[]>
retrieveSimilarGuidance(params): Promise<GuidanceMatch[]>
retrieveDocumentContext(params): Promise<DocumentMatch[]>
```

### RAG Token Budget (in chat route)

- MAX_RAG_CHARS = 3000 (RAG context block)
- Score threshold: 0.3 minimum
- KB chunks: up to 600 chars each, from `retrieveRelevantChunks`
- Multi-namespace matches: namespace-specific metadata mapping
  - research-history → `summary` field
  - assumption-guidance → `reasoning` + value range `low–mid–high`
- Document context: separate block, 800 chars per doc, topK=3

### When Adding New Features That Generate Knowledge

Always index to Pinecone when:
1. Research completes → `indexResearchResult()` to `research-history`
2. Guidance is computed → `indexAssumptionGuidance()` to `assumption-guidance`
3. Documents are uploaded → `indexDocumentExtraction()` to `documents`
4. Benchmarks refresh → `indexBenchmarkSnapshot()` to `comparables`
5. KB content changes → `indexKnowledgeBase()` to `knowledge-base`

### Knowledge Base Content (`server/ai/kb-content.ts`)

Currently includes:
- Business Model Overview, Rules & Constraints, Capital Structure
- Checker Manual methodology, platform guide, navigation
- GAAP Revenue Recognition (ASC 606), USALI Expense Classification
- Investment Metrics (IRR, Equity Multiple, Cap Rates, DSCR)
- ICP Definitions (location, physical, financial, market position scores)
- Benchmark Data Sources (STR, cap rates, debt market, operating expenses)

## Super Conversations (T21 IMPLEMENTED)

- Conversations persist in `rebecca_conversations` + `rebecca_messages`
- `getOrCreateConversation()` resumes or creates by userId + contextType + contextKey
- Context consistency: server rejects `conversationId` if context doesn't match current entity
- `newConversation` flag forces fresh thread creation
- DB history loads most recent N messages (desc + limit + reverse)
- Follow-up chips evolve by round count and field context

## Email + Feedback (T22 IMPLEMENTED)

### Routes (`server/routes/rebecca.ts`)

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/rebecca/email` | User | Derives summary server-side from DB messages, sends via Resend |
| `POST /api/rebecca/feedback` | User | Category (incorrect/unhelpful/missing_data/other) + notes |
| `GET /api/rebecca/conversations` | Admin | List all conversations |
| `GET /api/rebecca/feedback` | Admin | List feedback, optional status filter |

Security: Email content is NEVER client-supplied. Server loads conversation messages and derives subject/summary.

### UI Components

- `RebeccaEmailPreview.tsx` — Email preview modal (recipient input, subject/summary preview)
- `RebeccaFeedbackForm.tsx` — Feedback modal (category dropdown, notes textarea)
- Panel header buttons: Mail (email summary) + Flag (report issue), visible when conversation active with conversationId

## Context Builder (`server/ai/rebecca-context-builder.ts`)

Builds rich context server-side from entity IDs — never trusts client-provided context text.

- 40+ field label mappings with proper format (%, $, raw number)
- Calls `buildPropertyContextPack()` or `buildCompanyContextPack()`
- Fetches `assumption_guidance` for specific field when `fieldKey` provided
- Generates auto-greeting referencing field, research data, and entity name

## Key Files

| File | Purpose | Status |
|------|---------|--------|
| `server/routes/chat.ts` | Chat endpoint — context building, RAG injection, conversation persistence | ✅ T19-T23 |
| `server/routes/rebecca.ts` | Email + feedback routes | ✅ T22 |
| `server/ai/rebecca-context-builder.ts` | Builds entity+field context server-side | ✅ T20 |
| `server/ai/pinecone-service.ts` | Vector store — all 5 namespaces + multiNamespaceQuery | ✅ T23 |
| `server/ai/knowledge-base.ts` | KB indexing, retrieval, in-memory fallback | ✅ T23 |
| `server/ai/kb-content.ts` | Static KB content (GAAP, USALI, ICP, methodology) | ✅ T23 |
| `client/src/components/rebecca/RebeccaPanel.tsx` | 520px slide-over chat panel with email/feedback modals | ✅ T19-T22 |
| `client/src/components/rebecca/RebeccaContextCard.tsx` | Collapsed context card | ✅ T19 |
| `client/src/components/rebecca/RebeccaEmailPreview.tsx` | Email preview modal | ✅ T22 |
| `client/src/components/rebecca/RebeccaFeedbackForm.tsx` | Feedback form modal | ✅ T22 |
| `client/src/lib/panel-manager.ts` | Panel state (mutual exclusion, RebeccaContext) | ✅ T19-T21 |
| `shared/schema/intelligence-v2.ts` | rebecca_conversations, messages, emails, feedback tables | ✅ Schema |

## Feature Gate

Rebecca is disabled by default. Enabled via `global_assumptions.rebeccaEnabled` (boolean).
Feature flag: `REBECCA_V2` (currently OFF) — gates new Super Conversations features.

## Constraints

| Constraint | Value |
|-----------|-------|
| Max message length | 2,000 characters |
| Max history length | 20 messages |
| Rate limit | 20 requests per window |
| Max output tokens | 1,024 |
| RAG context budget | 3,000 characters |
| Score threshold | 0.3 minimum |
| Model | `gemini-2.5-flash` (configurable via admin) |

## Upcoming (T24)

### T24: Admin Rebecca Section (Stage 1)
1. **Configuration**: enable/disable, system prompt, model selection, temperature
2. **Conversation Logs**: searchable history, filter by user/property/date
3. **Feedback Reports**: feedback list with status tracking (new/reviewed/resolved)
