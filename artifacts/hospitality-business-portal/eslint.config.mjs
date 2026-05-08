import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "src/tests/**"],
  },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-shadow": [
        "error",
        {
          ignoreTypeValueShadow: false,
          ignoreFunctionTypeParameterNameValueShadow: true,
        },
      ],
      "@typescript-eslint/no-redeclare": "error",
      "no-shadow": "off",
      "no-redeclare": "off",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@phosphor-icons/react",
              message:
                "Import Phosphor icons from 'src/components/icons' barrel files, not directly from @phosphor-icons/react.",
            },
          ],
          patterns: [
            {
              group: ["@phosphor-icons/react/*"],
              message:
                "Import Phosphor icons from 'src/components/icons' barrel files, not directly from @phosphor-icons/react.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/components/icons/**/*.ts", "src/components/icons/**/*.tsx"],
    rules: {
      "no-restricted-imports": "off",
    },
  }
);
