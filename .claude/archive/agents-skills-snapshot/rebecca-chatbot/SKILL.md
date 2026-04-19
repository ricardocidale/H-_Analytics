---
name: rebecca-chatbot
description: "Rebecca AI assistant system for H+ Analytics. Covers Super Conversations with context injection, RAG knowledge architecture (7 pgvector namespaces), Knowledge Base CRUD with pgvector sync, Guardrail Editor with runtime injection, Rich Message Formatting (5 visual block types: stat/compare/timeline/insight/kpi), email summaries, feedback system, and admin configuration (5 tabs). Use when working on the chat endpoint, Rebecca UI, knowledge base, guardrails, rich block rendering, or chatbot configuration. IMPORTANT: 'Marcela' is never used; the AI assistant is always 'Rebecca.'"
---

# Rebecca Chatbot — Conversational Intelligence Layer

## Critical Rule

> **The AI assistant is ALWAYS "Rebecca."** "Marcela" does not exist. Never introduce Marcela references.

## System Overview

Rebecca is the AI chatbot and conversational intelligence layer for H+ Analytics. She provides "Super Conversations" — multi-turn, contextual dialogues about financial assumptions, market benchmarks, and research findings. Her intelligence comes from RAG retrieval across 7 pgvector namespaces.

## Key Subsystems

### 1. Personality & System Prompt (`chat.ts`)
- Super Conversations framework (curiosity, empathy, active listening)
- Voice register: conversational yet authoritative, hospitality terminology
- Banned phrases list (cliché AI responses)
- Rich Visual Block syntax + usage rules
- Admin-configured guardrails injected at runtime

### 2. Guardrail System (Task #305)
- **Table**: `rebecca_guardrails` in `intelligence-v2.ts`
- **CRUD**: `GET/POST/PATCH/DELETE /api/rebecca/guardrails` (admin-only)
- **Runtime**: Active guardrails fetched per query, appended to system prompt
- **Seeds**: 5 defaults (off-topic, legal/tax, guarantees, arithmetic, redirect)
- **UI**: `GuardrailEditor.tsx` — create, edit, toggle, delete, reorder

### 3. Knowledge Base CRUD (Task #306)
- **Tables**: `rebeccaKnowledgeBase` + `rebeccaKnowledgeHistory` in `intelligence-v2.ts`
- **CRUD**: 7 endpoints under `/api/rebecca/kb/*` (admin-only)
- **pgvector sync**: Active entries upserted with ID `admin-kb:{entryId}`, inactive entries DELETED from vectors
- **Version history**: Auto-snapshot on update, rollback support
- **Categories**: Methodology, Hospitality, Financial, FAQ, Custom
- **Seeds**: 26 entries from `kb-content.ts`
- **UI**: `KnowledgeBaseEditor.tsx` — stats cards, category tabs, search, CRUD, version history drawer

### 4. Rich Message Formatting (Task #307)
- **Parser**: `rich-block-parser.ts` — regex-based `:::blockType ... :::` detection, fenced code masking, case-insensitive keys
- **Block types**: stat, compare, timeline, insight, kpi
- **Renderers**: `RichBlockRenderers.tsx` — 5 H+ Analytics styled components (navy/teal/gold, Poppins)
- **Integration**: `RebeccaMarkdown.tsx` — mixed AST rendering (rich blocks + standard markdown)
- **Rules**: Max 1 block per response, conversational context required, skip for simple questions
- **Locale**: `t()` function supports en/es label translation

### 5. RAG Architecture (T23)
- 7 pgvector namespaces: knowledge-base, research-history, assumption-guidance, comparables, documents, scenarios, properties
- `multiNamespaceQuery()` for parallel cross-namespace search
- 3000-char RAG budget with 0.3 score threshold
- Namespace-specific metadata mapping

### 6. Super Conversations (T21)
- Persist in `rebecca_conversations` + `rebecca_messages`
- Context consistency enforcement (server rejects mismatched conversationId)
- Follow-up chips evolve by round count and field context

### 7. Email + Feedback (T22)
- Server-derived email summaries via Resend (never client-supplied)
- Feedback categories: incorrect, unhelpful, missing_data, other
- Admin endpoints for conversation and feedback management

## Admin Tabs (`RebeccaAdminTabs.tsx`)

| Tab | Component | Purpose |
|-----|-----------|---------|
| Configuration | `RebeccaConfig.tsx` | Enable/disable, prompt, model, temperature |
| Knowledge Base | `KnowledgeBaseEditor.tsx` | CRUD entries with pgvector sync, stats, versions |
| Guardrails | `GuardrailEditor.tsx` | Manage response rules, reorder, toggle |
| Conversations | `RebeccaConversationsTab` | Searchable history, expandable messages |
| Feedback | `RebeccaFeedbackTab` | Status-filtered list with status updates |

## Key Files

| File | Purpose |
|------|---------|
| `server/routes/chat.ts` | Chat endpoint — personality, RAG, conversations, rich blocks |
| `server/routes/rebecca.ts` | Email, feedback, guardrails CRUD, KB CRUD routes |
| `server/ai/rebecca-context-builder.ts` | Entity+field context assembly |
| `server/ai/pgvector-service.ts` | Vector store — all namespaces |
| `client/src/components/rebecca/RebeccaPanel.tsx` | 520px slide-over chat panel |
| `client/src/components/rebecca/RebeccaMarkdown.tsx` | Markdown + rich block rendering |
| `client/src/components/rebecca/rich-block-parser.ts` | Rich block AST parser |
| `client/src/components/rebecca/RichBlockRenderers.tsx` | 5 visual block components |
| `client/src/components/admin/ai/KnowledgeBaseEditor.tsx` | KB admin CRUD UI |
| `client/src/components/admin/ai/GuardrailEditor.tsx` | Guardrail admin UI |
| `client/src/components/admin/ai/RebeccaAdminTabs.tsx` | 5-tab admin container |
| `shared/schema/intelligence-v2.ts` | All Rebecca tables + storage |

## Constraints

| Constraint | Value |
|-----------|-------|
| Max message length | 2,000 characters |
| Max history | 20 messages |
| Rate limit | 20 req/window |
| Max output tokens | 1,024 |
| RAG budget | 3,000 characters |
| Score threshold | 0.3 |
| Rich blocks | Max 1 per response |
| KB pgvector ID | `admin-kb:{entryId}` |
| Feature flag | `REBECCA_V2` (ON) |
