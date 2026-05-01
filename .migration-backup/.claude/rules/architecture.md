# Architecture Rules

> Full reference (diagrams, file maps, data flow, auth details): `.claude/skills/architecture/SKILL.md`

## Stack (never deviate without explicit approval)

- **Frontend**: React 18 + TypeScript, Wouter routing, TanStack Query, Zustand, shadcn/ui, Tailwind CSS v4, Recharts, Framer Motion, Three.js
- **Backend**: Node.js, Express 5, TypeScript (ESM), esbuild, Drizzle ORM, PostgreSQL (Neon), Zod
- **AI**: Gemini 2.5 Flash (primary image gen + Rebecca chatbot), OpenAI gpt-image-1 (fallback), Anthropic Claude (verification/research)
- **Exports**: jsPDF, xlsx, pptxgenjs, dom-to-image-more
- **Hosting**: Replit (object storage, secrets, deployments)

## Core Design Constraints

1. **Two-entity model**: Property SPVs (individual hotels) + Management Company (OpCo). Never conflate them.
2. **Shared schema**: `shared/schema.ts` is the single source of truth for all types. Client and server both import from it.
3. **Storage interface**: All DB access goes through `IStorage` in `server/storage/`. Never query Drizzle directly from routes.
4. **Independent verification**: `server/calculationChecker.ts` must NEVER import from the client engine (`financial/property-engine.ts`, `financial/company-engine.ts`). Independence is the point.
5. **Feature modules**: Self-contained features go in `client/src/features/<name>/` with their own components, hooks, and `index.ts` barrel.
6. **API prefix**: All server endpoints under `/api/`. RESTful, organized by domain (`/api/auth/`, `/api/admin/`, `/api/properties/`, etc.).
