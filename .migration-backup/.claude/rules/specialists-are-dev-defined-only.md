# Specialists are dev-defined only — no runtime adjustment

> **Binding.** Specialists (The Analyst and every domain Specialist —
> Funding, Revenue, Costs, Macro, Market, Photos, Resources, etc.) are
> a product-defined cast. They are written, tuned, and shipped by
> engineering in collaboration with Architect. **Users and admins
> cannot adjust them at runtime.** Period.

## What this means in practice

A Specialist is the union of: persona + prompt template + LLM config +
required/recommended field set + resource assignments + workflow
graph + voice contract. **All of these are source-of-truth in code**,
not in the database, not in an admin UI, not behind a feature flag a
user can flip.

The only thing that flows runtime is *what the Specialist produces*:
verdicts, evidence, ranges, telemetry. Those are read by users; the
Specialist's *configuration* is not writable by them.

## Allowed admin surfaces (read-only observability)

Admins are operators, not authors. They may **view**:

- Specialist roster + status (`built`, `partial`, `planned`)
- Per-Specialist verdict history (audit log)
- Per-Specialist runtime telemetry (model used, tokens, latency, cost,
  regress counts, honest-fail rate)
- Per-Specialist required-fields list — **explicitly expected to be
  displayed under each Specialist in the admin section**, so operators
  can see what the Specialist needs to do its job and can debug
  missing-data symptoms. Display only. The list itself comes from the
  code-defined Specialist catalog; admins cannot toggle individual
  fields between required / recommended / off.
- Per-Specialist resource assignments (display only — to see which
  APIs / docs back its evidence)
- Per-Specialist quality history chart

Admins must **not** be able to:

- Toggle a field from `required` → `recommended` or vice versa
- Edit a Specialist's persona, name, prompt template, or voice
- Change a Specialist's LLM model, vendor, or routing rules
- Assign or unassign resources / APIs to a Specialist
- Edit a Specialist's workflow graph or prerequisite list
- Add, rename, retire, or duplicate a Specialist
- Override a Specialist's verdict, severity, or evidence

Anything in those second buckets is **a code change**, reviewed and
shipped by engineering + Architect, not a runtime knob.

## Why this exists

1. **Trust integrity.** A Specialist's verdict is only as trustworthy
   as the persona, prompt, and evidence path that produced it. If an
   admin can quietly retune a prompt, the audit trail behind every
   past verdict becomes unauditable.
2. **No silent product drift.** Changing what The Analyst evaluates,
   how it phrases verdicts, or which fields it considers required is a
   product-shape decision. Product-shape decisions live in code review,
   not in an admin form.
3. **No prompt-injection blast radius.** Admin UIs that write prompt
   templates are a single compromised account away from a poisoned
   intelligence layer for every customer.
4. **Architect alignment.** Specialist design is governed by the rules
   in this directory (`specialist-intelligence-bar.md`, `analyst-team.md`,
   `the-analyst-persona.md`, `analyst-verdict-contract.md`,
   `llm-vendor-roster.md`). The review path for a Specialist change
   is a code review against those rules, not a form submit.

## What to do when this rule conflicts with existing UI

Any admin route, button, modal, or API endpoint that lets a user write
a Specialist's configuration is a violation. The remediation order is:

1. **Hide / remove the write UI.** Keep the read-only observability if
   it has operator value; delete the write affordance.
2. **Remove the write API endpoint.** No `POST` / `PATCH` / `PUT` /
   `DELETE` against `/api/admin/specialists/*/config`,
   `/identity`, `/required-fields`, `/sources`, `/workflow`,
   `/llm-config`, `/recommendations`. `GET` endpoints stay for the
   observability surfaces above.
3. **Move the configuration into source.** Whatever the admin UI was
   writing into the database, lift into a code-defined catalog file
   under `server/ai/specialists/` or `engine/analyst/registry/`. Seed
   the database from the catalog at boot if persistence is needed for
   audit reasons; never the other way around.
4. **Add an enforcement test.** A proof-test file under `tests/proof/`
   asserts that no Specialist write endpoint exists in the route tree
   and no Specialist write component exists under `client/src/pages/admin/`.

## Cross-references

- `.claude/rules/the-analyst-persona.md` — voice & cast
- `.claude/rules/analyst-team.md` — Specialist roster shape
- `.claude/rules/specialist-intelligence-bar.md` — what every Specialist
  must clear (a code-review gate, not a runtime knob)
- `.claude/rules/analyst-verdict-contract.md` — verdict shape immutability
- `.claude/rules/security.md` — defense-in-depth rationale for #3
