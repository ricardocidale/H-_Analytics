---
name: rebecca-chatbot
description: "Rebecca — the sole AI assistant and conversational intelligence layer for H+ Analytics. Covers Super Conversations, context injection, email summaries, feedback, RAG knowledge architecture (Pinecone maximization), admin configuration, Knowledge Base CRUD with Pinecone sync, Guardrail Editor with runtime injection, and Rich Message Formatting (5 visual block types). Load when working on the chat endpoint, Rebecca UI, chatbot configuration, knowledge base management, guardrails, or research explanation flows. IMPORTANT — 'Marcela' is never used; the AI assistant is always 'Rebecca.'"
---

# Rebecca Chatbot — Conversational Intelligence Layer

## Critical Rule

> **The AI assistant is ALWAYS "Rebecca."** If the user says "Marcela," they mean Rebecca. Marcela does not exist in this application. Never introduce Marcela references anywhere.

## Purpose

Rebecca is the AI chatbot AND the conversational intelligence layer for the entire research system. She replaces complex tooltips for research explanations and provides "Super Conversations" — deep, multi-turn, contextual dialogues about any financial assumption, market benchmark, or research finding. Rebecca knows EVERYTHING about the portfolio via RAG retrieval across multiple Pinecone namespaces.

## Architecture (T19–T24 + Tasks #305–#307 IMPLEMENTED)

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
  ├── KB context: Admin Knowledge Base entries (active only, synced to Pinecone)
  └── Field context (if fieldContext present):
      ├── Validate entity ownership (IDOR prevention)
      ├── buildRebeccaContext(entityType, entityId, fieldKey?, scenarioId?)
      └── Inject FOCUSED ENTITY CONTEXT + FIELD-SPECIFIC RESEARCH
  ↓
Assemble system prompt: base personality + guardrails + portfolio + field + RAG + documents + rich block rules
  ↓
LLM call (Gemini/Perplexity based on engine setting)
  ↓
Persist assistant message → Generate follow-up chips
  ↓
Return { response, conversationId, suggestedChips, autoGreeting? }
```

## Personality & Guardrails (Task #305)

### System Prompt Structure (`DEFAULT_SYSTEM_PROMPT` in `chat.ts`)

The system prompt contains:
1. **Identity & voice**: Rebecca is a financial intelligence analyst, warm but professional, uses hospitality terminology
2. **Super Conversations framework**: Curiosity, art of questioning, empathy, active listening, trust building
3. **Voice register**: Conversational yet authoritative — no corporate jargon, no "certainly!", no "I'd be happy to"
4. **Banned phrases**: List of cliché AI responses to avoid
5. **User awareness**: Multi-user support ("ask if others are working through simulation")
6. **Brevity rules**: Concise responses, first message exception for longer greeting
7. **Rich Visual Blocks**: Syntax examples and usage rules (see Rich Block section below)
8. **Admin-Configured Guardrails**: Dynamically injected at query time from active guardrails in DB

### Guardrail System

- **Table**: `rebecca_guardrails` (id, label, rule, sortOrder, isActive, createdAt, updatedAt) in `intelligence-v2.ts`
- **Storage**: `getRebeccaGuardrails`, `getActiveRebeccaGuardrails`, `createRebeccaGuardrail`, `updateRebeccaGuardrail`, `deleteRebeccaGuardrail`
- **Routes**: `GET/POST/PATCH/DELETE /api/rebecca/guardrails` (admin-only, Zod-validated)
- **Runtime injection**: Active guardrails fetched at query time, appended as structured "Admin-Configured Guardrails" block in system prompt
- **Seed migration**: `rebecca-guardrails-001.ts` creates 5 defaults (off-topic, legal/tax, guarantees, arithmetic, redirect)
- **Admin UI**: `GuardrailEditor.tsx` — explainer banner, create form, inline edit, toggle, delete, drag-reorder (persists sortOrder via PATCH)

## Knowledge Base CRUD (Task #306)

### Schema

- **`rebeccaKnowledgeBase`** table: id, title, content, category, source, tags (text[]), priority (1-5), isActive, createdAt, updatedAt
- **`rebeccaKnowledgeHistory`** table: id, entryId (FK), snapshot (jsonb), changedBy, createdAt
- Insert schemas via `drizzle-zod` with `.pick()`, types exported

### Storage CRUD (`IntelligenceV2Storage`)

- `listRebeccaKBEntries(category?)` — optional category filter
- `getRebeccaKBEntry(id)`
- `createRebeccaKBEntry(data)`
- `updateRebeccaKBEntry(id, data)` — auto-snapshots to history before update
- `deleteRebeccaKBEntry(id)` — cascades history
- `getRebeccaKBHistory(entryId)`
- `rollbackRebeccaKBEntry(entryId, historyId)` — restores from snapshot
- `getRebeccaKBStats()` — total, active, vectorCount, byCategory breakdown

### API Routes (`server/routes/rebecca.ts`)

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/rebecca/kb` | Admin | List entries (optional `?category`) |
| `GET /api/rebecca/kb/stats` | Admin | Stats: total/active/vectorCount/byCategory |
| `POST /api/rebecca/kb` | Admin | Create entry |
| `PATCH /api/rebecca/kb/:id` | Admin | Update entry |
| `DELETE /api/rebecca/kb/:id` | Admin | Delete entry + vectors |
| `GET /api/rebecca/kb/:id/history` | Admin | Version history |
| `POST /api/rebecca/kb/:id/rollback/:historyId` | Admin | Rollback to snapshot |

### Pinecone Sync

- **ID pattern**: `admin-kb:{entryId}` in `knowledge-base` namespace
- **Active entries**: Upserted to Pinecone with title+content+category+source metadata
- **Inactive entries**: DELETED from Pinecone vectors (not upserted) — prevents deactivated content from being retrieved
- **On delete**: Vectors removed from Pinecone
- **On rollback**: If restored entry is inactive, vectors deleted; if active, vectors upserted
- **Non-blocking**: `syncKBEntryToPinecone()` is fire-and-forget with error logging

### Admin UI (`KnowledgeBaseEditor.tsx`)

- Stats cards: Total Entries, Active, Vector Count, Categories
- Category filter tabs: All / Methodology / Hospitality / Financial / FAQ / Custom
- Search input with debounce
- Create form: title, content (textarea), category (select), priority (1-5), tags (comma-separated)
- Inline edit per entry
- Toggle active/inactive (with Pinecone sync)
- Delete with confirmation dialog
- Version history drawer per entry with rollback button
- Tab: "Knowledge Base" in `RebeccaAdminTabs.tsx` (between Configuration and Guardrails)

## Rich Message Formatting (Task #307)

### Block Types

Rebecca can output 5 types of visual blocks using `:::blockType ... :::` syntax:

| Type | Purpose | Key Fields |
|------|---------|------------|
| `stat` | Single KPI highlight | value, label, delta?, source? |
| `compare` | Side-by-side table | title?, columns with metric rows |
| `timeline` | Phased plan | title?, phases (label \| description) |
| `insight` | Key takeaway callout | text, source? |
| `kpi` | Multi-metric dashboard | title?, metrics (label \| value \| delta?) |

### Parser (`rich-block-parser.ts`)

- Regex-based parser detects `:::blockType ... :::` patterns in assistant responses
- Returns AST array of `{ type: "markdown", content }` and `{ type: "rich-block", blockType, data }` nodes
- Fenced code blocks (`\`\`\`...\`\`\``) are masked before parsing to prevent false positives
- Parser keys (title:, source:) are case-insensitive for model output resilience
- Invalid/unparseable blocks fall back to plain markdown
- Exported: `parseRichBlocks(text)`, block data types

### Renderers (`RichBlockRenderers.tsx`)

5 styled React components using H+ Analytics design system:
- **StatBlock**: Large value + optional delta arrow (↑↓) + source attribution
- **CompareBlock**: Side-by-side table with navy header, alternating rows
- **TimelineBlock**: Vertical dot-connected phases with teal accents
- **InsightBlock**: Gold-bordered callout with lightbulb icon
- **KpiBlock**: Multi-metric card grid with navy/gold palette

Design: Navy #112548 headers, teal #0091AE accents, gold #FDB817 highlights, Poppins typography.
Locale: `locale` prop threaded through all renderers. `t()` function translates labels (en/es supported).
Data-testids: `rich-block-stat`, `rich-block-compare`, `rich-block-timeline`, `rich-block-insight`, `rich-block-kpi`.

### Markdown Integration (`RebeccaMarkdown.tsx`)

- `parseRichBlocks()` splits content into mixed AST nodes
- Rich block nodes rendered via `RichBlockRenderer` component
- Plain markdown nodes rendered via `ReactMarkdown` with existing image/link handling
- `locale` prop added to component interface (wired when i18n is introduced)

### System Prompt Rules (in `chat.ts`)

- Syntax examples for all 5 block types included in prompt
- **Max 1 block per response** — always with conversational sentence
- Skip blocks for simple/conversational questions
- Use `:::stat` for single metrics, `:::compare` for side-by-side, `:::kpi` for dashboards

## Pinecone RAG Architecture — MAXIMIZE USAGE

Rebecca's intelligence depends on comprehensive Pinecone retrieval. All namespaces MUST be leveraged:

### Namespaces (Index: `lb-hospitality`)

| Namespace | Purpose | Indexed By | Key Metadata Fields |
|-----------|---------|-----------|-------------------|
| `knowledge-base` | Static methodology docs + admin KB entries | `indexKnowledgeBase()` + admin CRUD sync | `title`, `content`, `source`, `category` |
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
5. KB content changes → admin CRUD auto-syncs via `syncKBEntryToPinecone()` to `knowledge-base`

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

## Admin Tabs (`RebeccaAdminTabs.tsx`)

| Tab | Component | Purpose |
|-----|-----------|---------|
| **Configuration** | `RebeccaConfig.tsx` | Enable/disable, system prompt, model selection, temperature |
| **Knowledge Base** | `KnowledgeBaseEditor.tsx` | CRUD entries with Pinecone sync, stats, version history |
| **Guardrails** | `GuardrailEditor.tsx` | Manage response rules, reorder, toggle |
| **Conversations** | `RebeccaConversationsTab` | Searchable history, expandable messages |
| **Feedback** | `RebeccaFeedbackTab` | Status-filtered list with status updates |

## Key Files

| File | Purpose | Status |
|------|---------|--------|
| `server/routes/chat.ts` | Chat endpoint — personality, context, RAG, conversations, rich block prompt | ✅ T19-T23 + #305-#307 |
| `server/routes/rebecca.ts` | Email + feedback + guardrails CRUD + KB CRUD routes | ✅ T22 + #305-#306 |
| `server/ai/rebecca-context-builder.ts` | Builds entity+field context server-side | ✅ T20 |
| `server/ai/pinecone-service.ts` | Vector store — all namespaces + multiNamespaceQuery | ✅ T23 |
| `server/ai/knowledge-base.ts` | KB indexing, retrieval, in-memory fallback | ✅ T23 |
| `server/ai/kb-content.ts` | Static KB content (GAAP, USALI, ICP, methodology) | ✅ T23 |
| `client/src/components/rebecca/RebeccaPanel.tsx` | 520px slide-over chat panel | ✅ T19-T22 |
| `client/src/components/rebecca/RebeccaMarkdown.tsx` | Markdown + rich block rendering | ✅ #307 |
| `client/src/components/rebecca/rich-block-parser.ts` | Rich block AST parser (5 types) | ✅ #307 |
| `client/src/components/rebecca/RichBlockRenderers.tsx` | 5 visual block components | ✅ #307 |
| `client/src/components/rebecca/RebeccaContextCard.tsx` | Collapsed context card | ✅ T19 |
| `client/src/components/rebecca/RebeccaEmailPreview.tsx` | Email preview modal | ✅ T22 |
| `client/src/components/rebecca/RebeccaFeedbackForm.tsx` | Feedback form modal | ✅ T22 |
| `client/src/components/admin/ai/KnowledgeBaseEditor.tsx` | KB admin UI — full CRUD | ✅ #306 |
| `client/src/components/admin/ai/GuardrailEditor.tsx` | Guardrail admin UI | ✅ #305 |
| `client/src/components/admin/ai/RebeccaAdminTabs.tsx` | 5-tab admin container | ✅ T24 + #305-#306 |
| `client/src/lib/panel-manager.ts` | Panel state (mutual exclusion, RebeccaContext) | ✅ T19-T21 |
| `shared/schema/intelligence-v2.ts` | All Rebecca tables + storage | ✅ Schema |

## Feature Gate

Rebecca is disabled by default. Enabled via `global_assumptions.rebeccaEnabled` (boolean).
Feature flag: `REBECCA_V2` (ON) — gates Super Conversations and new features.

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
| Rich blocks | Max 1 per response |
| KB Pinecone ID | `admin-kb:{entryId}` pattern |
| KB categories | Methodology, Hospitality, Financial, FAQ, Custom |
| Guardrail seeds | 5 defaults (off-topic, legal, guarantees, arithmetic, redirect) |

## Upcoming

### Task #308: Response Mode & Conversation Analytics Dashboard
- Response mode toggle (concise/detailed/auto)
- Conversation analytics (usage metrics, popular topics, response quality)

### Task #309: Multilingual Spanish Support
- Full i18n for Rebecca UI and responses
- Wire `locale` prop through RebeccaPanel → RebeccaMarkdown → RichBlockRenderers
