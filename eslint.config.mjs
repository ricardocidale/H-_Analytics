import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

const FINANCIAL_RESTRICTED = [
  {
    selector: "MemberExpression[object.name='Math'][property.name='pow']",
    message: "Math.pow is banned. Use dPow from calc/shared/decimal-helpers.ts (or eslint-disable-next-line with rationale for non-financial math like exponential backoff or tile zoom).",
  },
  {
    selector: "TSAsExpression[typeAnnotation.type='TSAnyKeyword']",
    message: "'as any' is banned. Use a specific type assertion (or 'as unknown as X' for genuinely opaque values, with a comment).",
  },
  {
    selector: "LogicalExpression[operator='||'][right.type='Literal'][right.value=0]",
    message: "'|| 0' silent numeric fallback is banned. Use ?? with explicit Number.isFinite check, or assertFinite from calc/shared/decimal-helpers.ts.",
  },
];

const NEW_BUG_GUARDS = [
  {
    // Bare fetch(url) with no init/options object — easy way to forget signal/timeout.
    selector: "CallExpression[callee.name='fetch'][arguments.length<2]",
    message: "fetch() must be called with an init object that includes an AbortSignal/timeout (use fetchWithTimeout from server/lib/fetch-with-timeout.ts).",
  },
];

// Internal Analyst team vocabulary. These names exist for code, docs, and skills
// only; they must NEVER reach a user-facing string. Persona rule: the user only
// ever sees "The Analyst" (singular). See:
//   - .claude/rules/the-analyst-persona.md
//   - .claude/rules/analyst-team.md
//   - docs/architecture/ANALYST.md
//   - docs/architecture/decisions/ADR-002-engine-analyst-skeleton.md
const ANALYST_INTERNAL_VOCAB_PATTERN =
  "Surface Specialist|Cognitive Engine|Surface Router|Voice Renderer|Quality Scorer";

const ANALYST_INTERNAL_VOCAB_FORBIDDEN_IN_CLIENT = [
  {
    selector: `Literal[value=/${ANALYST_INTERNAL_VOCAB_PATTERN}/]`,
    message:
      "Internal Analyst team vocabulary (Surface Specialist / Cognitive Engine / Surface Router / Voice Renderer / Quality Scorer) is forbidden in user-facing code. The user only ever sees 'The Analyst'. See .claude/rules/the-analyst-persona.md.",
  },
  {
    selector: `JSXText[value=/${ANALYST_INTERNAL_VOCAB_PATTERN}/]`,
    message:
      "Internal Analyst team vocabulary (Surface Specialist / Cognitive Engine / Surface Router / Voice Renderer / Quality Scorer) is forbidden in user-facing JSX. The user only ever sees 'The Analyst'. See .claude/rules/the-analyst-persona.md.",
  },
];

// Files that pre-date these rules and need bug-guard rules demoted to
// warnings (so CI does not break) instead of errors. The previous server/**
// allowlist was burned down in Task #340; only add files here with a
// // TODO(lint): comment explaining why and a plan to clean up. New
// violations in non-listed files surface as errors in CI (lint:strict).
const PRE_EXISTING_OFFENDERS = [];

export default [
  {
    ignores: [
      "node_modules/**",
      ".cache/**",
      "dist/**",
      "build/**",
      "**/*.d.ts",
    ],
  },

  // -------------------- calc/ + engine/ : financial code, strictest --------------------
  {
    files: ["calc/**/*.ts", "engine/**/*.ts"],
    ignores: ["**/*.test.ts", "**/*.spec.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      "no-restricted-syntax": [
        "error",
        ...FINANCIAL_RESTRICTED,
        {
          selector: ":matches(TSAnyKeyword)",
          message: "'any' type is banned in financial code. Use a specific type instead.",
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "safeNum",
          message: "safeNum is banned. Use assertFinite from calc/shared/decimal-helpers.ts instead.",
        },
      ],
    },
  },

  // -------------------- server/** + shared/** : bug guards as errors --------------------
  {
    files: ["server/**/*.ts", "shared/**/*.ts"],
    ignores: ["**/*.test.ts", "**/*.spec.ts", ...PRE_EXISTING_OFFENDERS],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      "no-restricted-syntax": ["error", ...FINANCIAL_RESTRICTED, ...NEW_BUG_GUARDS],
      // parseInt() without explicit radix → silent base-8/base-10 surprises.
      radix: ["error", "always"],
    },
  },

  // -------------------- pre-existing server/shared offenders : same rules at warn --------------------
  // PRE_EXISTING_OFFENDERS demotes the bug-guard rules from error → warn for
  // listed files. The list is empty after Task #340; this block is only
  // emitted when there are entries so eslint doesn't reject `files: []`.
  ...(PRE_EXISTING_OFFENDERS.length > 0
    ? [
        {
          files: PRE_EXISTING_OFFENDERS,
          ignores: ["**/*.test.ts", "**/*.spec.ts"],
          languageOptions: {
            parser: tsParser,
            parserOptions: { ecmaVersion: "latest", sourceType: "module" },
          },
          plugins: { "@typescript-eslint": tsPlugin },
          rules: {
            "no-restricted-syntax": ["warn", ...FINANCIAL_RESTRICTED, ...NEW_BUG_GUARDS],
            radix: ["warn", "always"],
          },
        },
      ]
    : []),

  // -------------------- client/** : same rules at warn level (UI-friendly) --------------------
  {
    files: ["client/src/**/*.ts", "client/src/**/*.tsx"],
    ignores: ["**/*.test.ts", "**/*.spec.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      "no-restricted-syntax": [
        "warn",
        ...FINANCIAL_RESTRICTED,
        // Internal Analyst team vocabulary is an ERROR-level violation even
        // though the surrounding rules are warn — leaking team names to the
        // user breaks the persona contract.
        ...ANALYST_INTERNAL_VOCAB_FORBIDDEN_IN_CLIENT,
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-console": ["warn", { allow: ["error", "warn", "info", "debug"] }],
    },
  },

  // -------------------- server/** general hygiene (kept from previous config) --------------------
  {
    files: ["server/**/*.ts"],
    ignores: ["**/*.test.ts", "**/*.spec.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-console": ["warn", { allow: ["error", "warn", "info", "debug"] }],
    },
  },
];
