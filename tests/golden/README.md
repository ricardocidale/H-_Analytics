# Golden Tests — Property Tax Rate Convention

## TL;DR

**Default behavior:** the shared property factory (`tests/fixtures/factories.ts`)
reads `costRateTaxes` from the registry (US default = `0.012`). This is the
single source of truth and is what every scenario test should use unless it has
an explicit, documented reason not to.

**Allowed exception:** a scenario test MAY override `costRateTaxes` to a
non-registry value when the test is exercising a *mechanism* (e.g. NOL accrual,
high-cost edge cases) rather than asserting the canonical US tax rate. When it
does, the override MUST carry a one-line "why" comment so future contributors
don't "fix" it back to the registry value.

## Background (Audit #406)

Before Audit #406, scenario fixtures were hand-pinned to a legacy
`costRateTaxes = 0.03` (a high-cost stand-in). #406 migrated the shared factory
to read from the registry, and re-baselined every golden IRR/NPV against the
US registry value of `0.012`. A handful of scenario tests still need the old
high-cost rate to drive their mechanic into the regime they are testing — those
overrides are intentional and are the only legitimate exception to the registry
default.

## Convention

- **Default:** do NOT pass `costRateTaxes` in `makeProperty(...)` — let the
  factory pull from the registry.
- **Exception:** if a scenario genuinely needs a different rate, override it
  inline AND leave a one-line comment of the form:

  ```ts
  // <Scenario reason>: pin legacy 0.03 to drive <mechanism> — not asserting
  // the canonical US property-tax rate.
  costRateTaxes: 0.03,
  ```

- **Reviewers:** if you see a `costRateTaxes:` override without a "why"
  comment, treat it as a bug, not a value to preserve.

## Known intentional pins

| File | Pinned value | Why |
| --- | --- | --- |
| `nol-carryforward-golden.test.ts` | `0.03` | High-cost property required to drive the scenario into early losses so NOL accrual is exercised. The registry default (`0.012`) is too low to trigger losses. |

If you add a new intentional pin, append a row here so the convention stays
discoverable.
