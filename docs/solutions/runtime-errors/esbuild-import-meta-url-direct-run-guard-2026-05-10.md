# esbuild bundle: `import.meta.url` direct-run guard fires on server boot

**Date:** 2026-05-10  
**Severity:** P0 — complete server crash on every boot (silent process.exit(0))  
**Symptom:** API server status shows FINISHED immediately after the seed phase; health check returns 502

---

## Root cause

Three `script/` modules used this pattern to detect "is this script being run directly via tsx?":

```ts
const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  seedModelDefaults().then(() => process.exit(0)).catch(...);
}
```

**This is safe when run with `tsx script/seed-model-defaults.ts`** — `import.meta.url` is the file's own URL, `process.argv[1]` is the script path, they match only for the intended file.

**This is broken when bundled with esbuild.** esbuild inlines all imported modules into a single `dist/index.mjs`. Every inlined module inherits the *bundle entry point's* `import.meta.url`. So when the server boots as `node dist/index.mjs`:

- `process.argv[1]` → `/path/to/dist/index.mjs`
- `import.meta.url` (inside the inlined module) → `file:///path/to/dist/index.mjs`
- **`isDirectRun` evaluates to `true`**
- `seedModelDefaults().then(() => process.exit(0))` fires
- Server exits cleanly after seeding — no error logged, no stack trace

The crash appeared silently because `process.exit(0)` is not an error. The only clue was the `[seed:schema-probe] ok` and `[seed:catalog-connections]` log entries never appearing (the server exited before they ran).

---

## Files affected

| File | Pattern | Imported by server? |
|---|---|---|
| `script/seed-model-defaults.ts` | Broken | Yes (via `src/index.ts`) |
| `script/seed-model-constants.ts` | Broken | Yes (via `src/index.ts`) |
| `script/seed-reference-data.ts` | Broken | No (latent) |
| `script/check-no-legacy-storage-urls.ts` | Already fixed (argv basename check) | No |

---

## Fix

Replace `import.meta.url` comparison with a `process.argv[1]` basename regex check. This is bundle-safe because `argv[1]` always reflects the *actual file* Node was told to execute, regardless of esbuild's module inlining:

```ts
// WRONG — fires true for ALL inlined modules when bundled
const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

// CORRECT — checks whether Node was explicitly invoked with this script
const isDirectRun =
  Boolean(process.argv[1]) &&
  /seed-model-defaults\.[jt]s(x?)$/.test(process.argv[1]);
```

Applied this fix to all three affected files.

---

## How to detect this in future scripts

Any `script/` file that:
1. Exports a function AND  
2. Contains `import.meta.url === pathToFileURL(resolve(process.argv[1])).href` AND  
3. Is dynamically imported anywhere inside `src/` (even transitively)

...will crash the server on boot.

**Safe pattern:** `check-no-legacy-storage-urls.ts` already uses the correct argv approach:
```ts
if (process.argv[1]?.endsWith("check-no-legacy-storage-urls.ts") ||
    process.argv[1]?.endsWith("check-no-legacy-storage-urls.js")) {
  main();
}
```

Or equivalently with a regex:
```ts
const isDirectRun =
  Boolean(process.argv[1]) &&
  /my-script-name\.[jt]s(x?)$/.test(process.argv[1]);
```

---

## Secondary fixes in same session

Also addressed in this session:

- **`admin-resources-009.ts` recreated** — consolidated idempotent migration patching `claude-opus-4-7` → `claude-sonnet-4-5` in `global_assumptions.research_config` (both per-domain and `tabDefaults` keys). Registered in `src/index.ts` seedTasks after admin-resources-008.
- **`DEPRECATED_MODEL_MAP` in `src/ai/clients.ts`** — added `"claude-opus-4-7": "claude-sonnet-4-5"` as a code-level safety net for any stale model IDs that reach the AI client layer.
- **magic-numbers baseline re-locked** — 137 values after `rebecca-tools.ts` pre-existing literals were accepted.
