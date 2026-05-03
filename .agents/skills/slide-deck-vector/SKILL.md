---
name: slide-deck-vector
description: Store, version, and semantically retrieve slide decks in pgvector. Use when persisting decks (semantic spec + render-IR), querying decks by similarity, or building a slide-archetype library across many decks. Reuses any pgvector-backed vector store with a `vector_chunks(namespace, id, text, jsonb metadata, vector embedding)` shape. Pairs with slide-deck-spec.
---

# Slide Deck Vector Storage

Persist slide decks in a pgvector store using a **two-layer** layout: one parent row per deck plus one child row per slide. This gives deck-level shared state (theme/assets/version) AND per-slide editing + per-slide semantic retrieval.

## When to Use

- Saving a generated/edited deck so it survives the request.
- Loading a deck by `deckId` for render/export.
- "Find me cover slides like this one across all properties" — semantic search.
- Versioning decks (every save = new `revisionId`).

## Required Infrastructure

A pgvector table with this shape (matches the H+ project's `vector_chunks`):

```sql
CREATE TABLE vector_chunks (
  namespace text NOT NULL,
  id text NOT NULL,
  text text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  embedding vector(1536) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (namespace, id)
);
CREATE INDEX ON vector_chunks USING hnsw (embedding vector_cosine_ops);
```

Embedding model: `text-embedding-3-small` (1536 dims, cosine). Use `OPENAI_EMBEDDING_KEY` direct to `https://api.openai.com/v1` (skip any AI proxy — most don't support `/embeddings`).

## Namespace & ID Conventions

Two namespaces, parent-child by ID prefix:

| Namespace | ID format | Holds |
|---|---|---|
| `slide-decks` | `${deckId}@${revisionId}` | parent: full semantic spec + render-IR + theme + assets |
| `slide-deck-slides` | `${deckId}@${revisionId}#${slideId}` | child: single slide's semantic + render-IR + archetype |

Old revisions are NEVER overwritten. Always insert new `revisionId`. The "current" revision is whichever the app's pointer table or convention designates (e.g. `decks.current_revision_id` in your app schema, OR the latest `updated_at` per `deckId`).

## What to Embed (the `text` column)

**Semantic content only.** Never embed pixel coordinates, hex colors, or asset bytes — they pollute similarity.

- **Parent (`slide-decks`)** — embed: deck title + each slide archetype + each slide's title + 1-line summary. Total ~1–3 KB.
- **Child (`slide-deck-slides`)** — embed: slide title + headline + bullets + speaker notes + key resolved numbers (e.g. `"IRR 18.4%, ADR $310"`). Total ~0.5–2 KB.

The full JSON spec lives in `metadata`, not `text`.

## Required Metadata Fields

On EVERY row (enables `queryByMetadataExact` filtering):

```jsonc
{
  "deckId": "string",
  "revisionId": "string",
  "kind": "deck" | "slide",
  "schemaVersion": "1.0",
  "createdAt": "ISO-8601",
  "createdBy": "string",                  // user id or "system"
  "sourceFileHash": "sha256-hex" | null   // when imported from PPTX
}
```

Slide rows additionally carry:
```jsonc
{
  "slideId": "string",
  "slideIndex": 0,
  "archetype": "cover" | "property-spotlight" | ...,
  "templateId": "string" | null,          // optional template lineage
  "boundEntityType": "property" | "company" | null,
  "boundEntityId": "string" | null
}
```

The full semantic spec and render-IR live in `metadata.spec` and `metadata.renderIR`. Validate with Zod from `slide-deck-spec` before insert.

## Standard Operations

### Save a deck (new revision)
1. Validate semantic spec + render-IR with Zod.
2. Generate `revisionId` (e.g. `ULID` or `${epochMs}-${rand}`).
3. Build embed-text for the parent + each slide.
4. Batch-embed (one OpenAI call: `[parentText, ...slideTexts]`).
5. Upsert all rows in a single transaction.
6. Update your app's "current revision" pointer.

### Load latest deck
1. `SELECT id, metadata FROM vector_chunks WHERE namespace='slide-decks' AND metadata->>'deckId'=$1 ORDER BY updated_at DESC LIMIT 1`.
2. Return `metadata.spec` and `metadata.renderIR`. No embedding call needed.

### Find similar slides across decks
1. Embed query text.
2. `SELECT id, text, metadata, 1 - (embedding <=> $1) AS score FROM vector_chunks WHERE namespace='slide-deck-slides' AND metadata @> $2::jsonb ORDER BY embedding <=> $1 LIMIT $3`.
3. Filter `$2` by `archetype`, `boundEntityType`, etc. Use `cosine` distance (`<=>`).

### Hydrate a slide row back into a full deck
Always look up the parent by `${deckId}@${revisionId}` to get shared theme/assets — slide rows alone are missing context.

## Anti-Patterns

- **Embedding render-IR** — pixel coords destroy retrieval relevance.
- **Mutating a revision** — breaks audit + undo. Always insert new.
- **One row per deck only** — kills per-slide retrieval; kills granular edits.
- **One row per slide only** — loses theme/asset/version state; forces denormalization.
- **Inline base64 in metadata** — bloats every search hit. Use the asset registry from `slide-deck-spec`.
- **Different embedding models per namespace** — breaks cosine math. Pin one model.
