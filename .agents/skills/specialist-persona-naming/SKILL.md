---
name: specialist-persona-naming
description: Persona-first / role-second naming rule for the AI Specialists across every admin surface. Use whenever you create, modify, or review any user-facing string, component, toast, status line, page header, mention, conversation log entry, sidebar row, or system message that names one of the AI Specialists or the Analyst orchestrator (Gustavo, Ana, Bia, Cecília, Daniela, Eloá, Fernanda, Giovanna, Helena, Isabela, Júlia, Larissa, …). Replaces the reflex of "specialist-property-risk-intelligence" / "Risk Intelligence" / "the specialist" with the canonical persona name, optionally followed by a quieter role tag.
---

# Persona-first naming for the Analyst Specialists

## The rule

Anywhere the admin app names a Specialist — a sidebar row, a page
header, a toast, a status badge, a mention inside body copy, a
conversation log entry, an alert, an email, an export footer — **lead
with the persona's human name**. The role label ("Funding
Intelligence", "Risk Intelligence", "Photo Enhancer & Renders") rides
along as a quieter secondary line, suffix, or tooltip — never as the
primary affordance.

| | ❌ Wrong | ✅ Right |
|---|---|---|
| Sidebar row | "Funding Intelligence" / "specialist-mgmt-co-funding" | **Ana** *Funding Intelligence* (two-line) |
| Toast | "Risk Intelligence finished refreshing." | "**Daniela** finished refreshing." |
| Status copy | "The specialist is studying…" | "**Ana** is studying current STR data…" |
| Page header | "Funding Intelligence" | "**Ana** · Funding Intelligence" |
| Mention chip in body copy | "the funding agent" / "@funding" | "**Ana**" with a tinted A-monogram chip |
| System message | "the orchestrator delegated this to a specialist" | "**Gustavo** delegated this to **Ana**" |
| Email subject | "[Risk] Update available" | "Daniela has an update for you" |

Why: the user has hired colleagues, not modules. Twelve-plus role
labels are interchangeable noise; twelve-plus persona names are
memorable and build trust. The product is "you have a research team",
not "you have an AI platform with twelve modules".

## Resolution precedence (high → low)

Always resolve through this chain — never hard-code a name:

1. **`liveHumanNameById`** — admin override fetched from
   `/api/admin/specialists`. Renaming a Specialist in the Identity tab
   must update every surface without a page reload.
2. **`catalog.humanName`** — the persona name shipped in
   `engine/analyst/registry/specialist-catalog.ts` (e.g. "Ana", "Bia").
3. **`catalog.displayName`** — the role label ("Funding Intelligence").
   Used only when no persona name exists yet for a freshly-added
   Specialist.
4. **`catalog.realName`** — the short technical name ("Funding").
5. **The raw id** — last-resort fallback so the UI never crashes on a
   stale or renamed Specialist.

The orchestrator (Gustavo) lives outside `SPECIALIST_CATALOG`; resolve
him via `GUSTAVO_IDENTITY` from `engine/analyst/identity.ts`. The
canonical resolver in `useSpecialistDisplay` already handles this —
prefer the resolver over hand-rolled lookups.

## The canonical components — use these, do not roll your own

`client/src/components/specialists/SpecialistName.tsx` is the single
visual + voice contract for naming a Specialist on screen.

```tsx
import { SpecialistName, useSpecialistDisplay } from "@/components/specialists";

// Sidebar / dense list — persona name on top, role label underneath.
<SpecialistName id="mgmt-co.funding" variant="stacked" />

// Page header / toast — persona name with a quieter " — Role" suffix.
<SpecialistName id="mgmt-co.funding" variant="inline" size="lg" />

// Mention inside body copy — small monogram chip in the team color.
<>Click <SpecialistName id="mgmt-co.funding" variant="chip" /> to see her sources.</>

// Custom layout — pull the parts and compose your own.
const { humanName, role, initial, subject } = useSpecialistDisplay("mgmt-co.funding");
```

The component handles:

- The full resolution chain above (live override → catalog → id fallback)
- A monogram avatar tinted by the Specialist's subject group so a
  sidebar of twelve-plus rows is still scannable at a glance
- Three variants (stacked / inline / chip) and three sizes (sm / md / lg)
- A tooltip on the chip variant carrying the role for context
- The orchestrator (Gustavo) explicitly, with the brand intelligence
  accent color
- A stable `data-testid` of `specialist-name-{id}`

## The team palette — how twelve-plus stay scannable

The six subject groups each get a soft tinted monogram so admins learn
to scan by initial-color combination, not by reading the full role
label every time:

| Subject | Hue | Examples |
|---|---|---|
| `mgmt-co` | amber | Ana, Bia, Cecília |
| `property` | teal | Daniela, Eloá |
| `photos` | fuchsia | Fernanda |
| `portfolio-ops` | sky | Giovanna |
| `constants` | violet | Helena, Isabela, Júlia, Larissa |
| `resources` | emerald | (resources builder) |
| `analyst` (Gustavo, the orchestrator) | accent-pop (gold) | Gustavo |

Tints are intentionally soft (`/15` background, `/20` ring) so multiple
chips on one line don't shout at each other; the persona's *initial*
carries the recognition load. The palette uses theme tokens so it
tracks light/dark mode automatically.

## Voice rule — what to call them in copy

When the admin app talks **to** the user about a Specialist, address
the Specialist by name. The forbidden phrasings below all read as
software, not as a colleague.

> **NEVER:** "the specialist" · "the agent" · "the AI" · "the model" ·
> "the system" · "the orchestrator" · "your AI assistant" · `<role>` as
> the subject of a sentence ("Funding Intelligence is processing…")
>
> **ALWAYS:** the persona's first name, optionally followed by " —
> *Role*" on first mention in a long-form message. Pronouns may be
> used after the first mention. Gender follows the catalog's `gender`
> field.

Pair with `.claude/brand-voice-guidelines.md` and
`.agents/skills/analyst-research-buttons/SKILL.md`: when **Ana** is
studying, the indicator says "**Ana** is studying current STR data…",
never "the specialist is processing your request".

## Surfaces this rule applies to

Audit every one of these the next time you touch them:

- AI sidebar (`AiIntelligenceSidebar.tsx`) — already compliant via
  `specialistRow()`; keep it that way
- Specialist page headers (`SpecialistPage.tsx` and friends) — already
  compliant via `orchestratorMeta()` / `sectionMeta`; extend the same
  pattern to any new tab
- Toasts and status copy fired from admin actions (e.g. refresh
  complete, override saved, research scheduled) — render the persona
  name, not the role
- Conversation log entries that record which Specialist did what
- Mention chips inside body copy on admin surfaces — use the `chip`
  variant
- Pending Proposals queue ("Ana proposed a new range for…")
- Scheduled-research panel ("Daniela runs every Monday at 6am UTC")
- Email/export footers that credit the Specialist who produced an
  artifact
- System health surfaces — when a Specialist is degraded, name her

The front-of-app product surfaces (everything outside `client/src/
components/admin/**` and `client/src/pages/admin/**`) follow the
front-of-app-admin-isolation skill instead — those surfaces never
reference Specialists by name. Personas are an admin-only concept.

## Quick checklist before committing

1. Does every user-visible string that names a Specialist lead with the
   persona name? ✅
2. Does the role label ride along as a quieter secondary line, suffix,
   or tooltip — not as the primary affordance? ✅
3. Did you go through `<SpecialistName />` or `useSpecialistDisplay()`
   instead of hard-coding a name or reaching directly into the
   catalog? ✅
4. Did you avoid the forbidden phrasings ("the specialist", "the
   agent", `<role>` as subject)? ✅
5. If you added a new Specialist, does the catalog have a `humanName`
   and a `subject`? (No persona name = the resolver falls through to
   the role label and the team color goes muted.) ✅
