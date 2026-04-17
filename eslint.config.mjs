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

// Files that pre-date these rules. They keep the financial rules at warn level
// instead of error so CI does not break, but new code in them still gets
// flagged in the editor. Clean up incrementally and remove from this list.
const PRE_EXISTING_OFFENDERS = [
  // Math.pow — non-financial usage (backoff, tile math, rounding helpers)
  "server/db.ts",
  "server/integrations/base.ts",
  "server/routes/geospatial.ts",
  "server/ai/portfolio-risk-scorer.ts",
  "server/ai/executive-summary.ts",
  "server/calculation-checker/index.ts",
  // 'as any' / '|| 0' heavy files
  "server/ai/**/*.ts",
  "server/routes/**/*.ts",
  "server/replit_integrations/**/*.ts",
  "server/storage/**/*.ts",
  "server/migrations/**/*.ts",
  "server/integrations/**/*.ts",
  "server/report/**/*.ts",
  "server/document-ai/**/*.ts",
  "server/image/**/*.ts",
  "server/services/**/*.ts",
  "server/data/**/*.ts",
  "server/scripts/**/*.ts",
  "server/lib/fetch-with-timeout.ts",
  "server/table-renderer.ts",
  "server/syncHelpers.ts",
  "server/theme-resolver.ts",
  "server/index.ts",
];

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
      "no-restricted-syntax": ["warn", ...FINANCIAL_RESTRICTED],
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
