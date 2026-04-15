# Branding & Vocabulary Enforcement — MANDATORY

This rule is non-negotiable. Every commit, every UI string, every tooltip, every
error message, every loading state MUST comply. No exceptions.

## App Identity

| Concept | Canonical Name | What It Is | NEVER Use |
|---|---|---|---|
| The app | **H+ Analytics** | The product. Editable by super admin in Admin > App Identity. | "the system", "the platform", "the portal", "the tool" |
| The technology company | **Norfolk AI** | Built and powers H+ Analytics. | "Norfolk Group", "Norfolk Consulting" |
| The management company | **Hospitality Management Co** (default seed) | The user's hospitality brand. Editable by any user on Management Company page. | Confusing this with the app name |
| The research engine | **Norfolk AI Engine** | Powers The Analyst. | "pipeline", "system", "backend", "AI model" |

## The Two AI Agents

| Agent | Canonical Name | Always Capitalized | NEVER Use |
|---|---|---|---|
| The intelligence agent | **The Analyst** | Always "The Analyst" with capital T and A | "an analyst", "the analysts" (plural), "our analysts", "your analysts", "AI research", "the engine" |
| The companion agent | **Rebecca** | Always "Rebecca" | "Marcela", "the chatbot", "the assistant", "AI helper", "the bot" |

## Forbidden Terms — ZERO TOLERANCE

These terms must NEVER appear in user-facing UI text. The audit test
`tests/audit/vocabulary-compliance.test.ts` enforces this on every commit.

| Forbidden | Use Instead |
|---|---|
| Regenerate Intelligence | Ask the Analyst |
| Generate Research | Consult |
| Ask the Analysts (PLURAL) | Ask the Analyst (SINGULAR) |
| No Intelligence | Not yet reviewed |
| Stale / Fresh | Due for review / Up to date |
| Confidence Score (with %) | Conviction: High / Moderate / Developing |
| Run / Execute / Generate (for AI actions) | The Analyst is studying / reviewing / cross-referencing |
| Algorithm / Model / Engine (in UI) | The Analyst |
| The system / The AI | The Analyst or Rebecca (by name) |
| Pipeline | Norfolk AI Engine |
| Update (button label) | Save |

## Loading State Language

When The Analyst is working, the UI shows specific, human actions:
- "Studying market trends and comparable properties..."
- "Cross-referencing industry benchmarks..."
- "Checking recent transactions in your market..."

NEVER: "Processing...", "Generating...", "Loading...", "Computing...", "Running..."

## Copy Voice

All app copy follows the behavioral economics style defined in `vocabulary/SKILL.md`
Section 11. Simple language, everyday analogies, gentle wit, nudging over lecturing.

## Enforcement

- `tests/audit/vocabulary-compliance.test.ts` blocks forbidden terms on commit
- Every AI coder (Claude, Replit) must read `vocabulary/SKILL.md` before writing UI text
- Every PR that adds user-facing text must pass the vocabulary audit
