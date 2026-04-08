import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Recalculation Enforcement — Strengthened Audit
 *
 * Ensures every financial mutation calls invalidateAllFinancialQueries,
 * non-financial mutations do NOT, and ALL_FINANCIAL_QUERY_KEYS is complete.
 *
 * This is a static analysis test — it reads source files and inspects
 * the AST-like text patterns to verify compliance with the recalculate-on-save rule.
 */

const apiDir = path.resolve(__dirname, "../../client/src/lib/api");
const apiFiles = fs.readdirSync(apiDir).filter(f => f.endsWith(".ts"));

function readApiFile(name: string): string {
  return fs.readFileSync(path.join(apiDir, name), "utf-8");
}

const allApiContent = apiFiles.map(f => readApiFile(f)).join("\n");

/** Extract all `export function useXxx()` hook names from a file */
function extractHooks(content: string): string[] {
  return [...content.matchAll(/export function (use\w+)\(/g)].map(m => m[1]);
}

/** Extract the body of a hook function (from its declaration to the next export or EOF) */
function extractHookBody(content: string, hookName: string): string | null {
  const funcStart = content.indexOf(`export function ${hookName}(`);
  if (funcStart === -1) return null;
  const nextExport = content.indexOf("export function ", funcStart + 1);
  return nextExport === -1
    ? content.slice(funcStart)
    : content.slice(funcStart, nextExport);
}

/** Find which file contains a hook */
function findHookFile(hookName: string): { fileName: string; content: string } | null {
  for (const fileName of apiFiles) {
    const content = readApiFile(fileName);
    if (content.includes(`export function ${hookName}(`)) {
      return { fileName, content };
    }
  }
  return null;
}

// Categorize ALL mutation hooks
const allMutationHooks: string[] = [];
const allQueryHooks: string[] = [];
for (const fileName of apiFiles) {
  const content = readApiFile(fileName);
  const hooks = extractHooks(content);
  for (const hook of hooks) {
    const body = extractHookBody(content, hook);
    if (!body) continue;
    if (body.includes("useMutation")) {
      allMutationHooks.push(hook);
    } else if (body.includes("useQuery")) {
      allQueryHooks.push(hook);
    }
  }
}

// Financial mutations — these MUST call invalidateAllFinancialQueries
const FINANCIAL_MUTATIONS = [
  // Properties
  "useCreateProperty",
  "useUpdateProperty",
  "useDeleteProperty",
  "useUpdateFeeCategories",
  // Global assumptions
  "useUpdateGlobalAssumptions",
  // Scenarios
  "useCreateScenario",
  "useLoadScenario",
  "useUpdateScenario",
  "useDeleteScenario",
  // Service templates
  "useCreateServiceTemplate",
  "useUpdateServiceTemplate",
  "useUpdateCompanyServiceTemplate",
  "useDeleteServiceTemplate",
  "useSyncServiceTemplates",
  // Property photos (hero changes affect properties.imageUrl)
  "useAddPropertyPhoto",
  "useDeletePropertyPhoto",
  "useSetHeroPhoto",
  "useShareScenario",
];

// Non-financial mutations — these MUST NOT call invalidateAllFinancialQueries
const NON_FINANCIAL_MUTATIONS = [
  "useSaveFavorite",
  "useDeleteFavorite",
  "useUpdateFavoriteNotes",
  "useCreateSavedSearch",
  "useDeleteSavedSearch",
  "useCreateResearchQuestion",
  "useUpdateResearchQuestion",
  "useDeleteResearchQuestion",
  "useRefreshRate",
  "useRefreshAllRates",
  "useOverrideRate",
  "useSaveResearchConfig",  // Admin research prompt config — does not affect financial calculations
  "useRefreshAiModels",     // Admin AI model list refresh — does not affect financial calculations
  "useUpdateAdminConfig",   // Non-financial global_assumptions (branding, ICP, sidebar, asset def) — only invalidates globalAssumptions query
  // Property photos (caption/reorder/enhance don't affect financial data)
  "useUpdatePropertyPhoto",
  "useReorderPhotos",
  "useEnhancePhoto",
  "useRemoveEnhancement",
  // Scenario auto-save and admin restore/purge — do not affect live financial calculations
  "useAutoSave",
  "useRestoreScenario",
  "usePurgeScenario",
  "usePurgeExpiredScenarios",
  "useGrantScenarioAccess",
  "useRevokeScenarioAccess",
];

describe("Recalculation Enforcement", () => {
  // ─── Completeness: every mutation hook is categorized ───
  describe("Mutation hook categorization", () => {
    it("every mutation hook in api/ is categorized as financial or non-financial", () => {
      const categorized = new Set([...FINANCIAL_MUTATIONS, ...NON_FINANCIAL_MUTATIONS]);
      const uncategorized = allMutationHooks.filter(h => !categorized.has(h));
      expect(
        uncategorized,
        `Uncategorized mutation hooks found: ${uncategorized.join(", ")}. ` +
        `Add them to FINANCIAL_MUTATIONS or NON_FINANCIAL_MUTATIONS in this test.`
      ).toHaveLength(0);
    });

    it("no phantom hooks in the categorization lists", () => {
      const allHookSet = new Set(allMutationHooks);
      for (const hook of [...FINANCIAL_MUTATIONS, ...NON_FINANCIAL_MUTATIONS]) {
        expect(allHookSet.has(hook), `${hook} is listed but not found in api/ files`).toBe(true);
      }
    });
  });

  // ─── Financial mutations MUST call invalidateAllFinancialQueries ───
  describe("Financial mutations call invalidateAllFinancialQueries", () => {
    for (const hookName of FINANCIAL_MUTATIONS) {
      it(`${hookName} calls invalidateAllFinancialQueries`, () => {
        const file = findHookFile(hookName);
        expect(file, `Could not find ${hookName} in any api file`).not.toBeNull();
        const body = extractHookBody(file!.content, hookName);
        expect(body).not.toBeNull();
        expect(
          body!.includes("invalidateAllFinancialQueries"),
          `${hookName} in ${file!.fileName} must call invalidateAllFinancialQueries in onSuccess`
        ).toBe(true);
      });
    }
  });

  // ─── Non-financial mutations MUST NOT call invalidateAllFinancialQueries ───
  describe("Non-financial mutations do NOT call invalidateAllFinancialQueries", () => {
    for (const hookName of NON_FINANCIAL_MUTATIONS) {
      it(`${hookName} does not call invalidateAllFinancialQueries`, () => {
        const file = findHookFile(hookName);
        expect(file, `Could not find ${hookName} in any api file`).not.toBeNull();
        const body = extractHookBody(file!.content, hookName);
        expect(body).not.toBeNull();
        expect(
          body!.includes("invalidateAllFinancialQueries"),
          `${hookName} in ${file!.fileName} must NOT call invalidateAllFinancialQueries — ` +
          `it is a non-financial mutation (favorites, saved searches, research questions)`
        ).toBe(false);
      });
    }
  });

  // ─── ALL_FINANCIAL_QUERY_KEYS completeness ───
  describe("ALL_FINANCIAL_QUERY_KEYS completeness", () => {
    it("ALL_FINANCIAL_QUERY_KEYS array exists in properties.ts", () => {
      const propertiesContent = readApiFile("properties.ts");
      expect(propertiesContent).toContain("ALL_FINANCIAL_QUERY_KEYS");
    });

    it("contains all expected financial query key prefixes", () => {
      const propertiesContent = readApiFile("properties.ts");
      const match = propertiesContent.match(
        /const ALL_FINANCIAL_QUERY_KEYS = \[\s*([\s\S]*?)\s*\] as const;/
      );
      expect(match).toBeDefined();

      const definedKeys = [...match![1].matchAll(/\[\s*"([^"]+)"\s*\]/g)].map(m => m[1]);
      const expectedKeys = [
        "globalAssumptions",
        "properties",
        "feeCategories",
        "scenarios",
        "research",
        "serviceTemplates",
      ];

      for (const key of expectedKeys) {
        expect(
          definedKeys.includes(key),
          `ALL_FINANCIAL_QUERY_KEYS is missing "${key}"`
        ).toBe(true);
      }
    });

    it("every queryKey prefix used in financial query hooks is covered", () => {
      const propertiesContent = readApiFile("properties.ts");
      const match = propertiesContent.match(
        /const ALL_FINANCIAL_QUERY_KEYS = \[\s*([\s\S]*?)\s*\] as const;/
      );
      const definedKeys = new Set(
        [...match![1].matchAll(/\[\s*"([^"]+)"\s*\]/g)].map(m => m[1])
      );

      // Collect all queryKey prefixes from financial query hooks
      const financialQueryPrefixes = new Set<string>();
      const financialFiles = ["properties.ts", "admin.ts", "scenarios.ts", "services.ts"];
      for (const fileName of financialFiles) {
        const content = readApiFile(fileName);
        const queryKeyMatches = content.matchAll(/queryKey:\s*\[\s*"([^"]+)"/g);
        for (const m of queryKeyMatches) {
          financialQueryPrefixes.add(m[1]);
        }
      }

      // Non-financial keys that are OK to exclude
      const nonFinancialKeys = new Set([
        "research-questions",     // Research questions have their own invalidation
        "admin-research-config",  // Admin research prompt config — does not affect financial calculations
        "admin",                  // Admin scenario management (deleted scenarios, restore) — does not affect financial calculations
      ]);

      for (const prefix of financialQueryPrefixes) {
        if (nonFinancialKeys.has(prefix)) continue;
        expect(
          definedKeys.has(prefix),
          `Query key prefix "${prefix}" is used in a financial file but not in ALL_FINANCIAL_QUERY_KEYS`
        ).toBe(true);
      }
    });
  });

  // ─── No direct bypass of centralized helper ───
  describe("No direct invalidateQueries bypass for financial keys", () => {
    it("no direct queryClient.invalidateQueries calls for financial query keys", () => {
      const financialKeys = [
        "globalAssumptions", "properties", "feeCategories",
        "scenarios", "research", "serviceTemplates",
      ];

      for (const fileName of apiFiles) {
        const content = readApiFile(fileName);
        const directCalls = [...content.matchAll(
          /queryClient\.invalidateQueries\(\{\s*queryKey:\s*\[\s*"([^"]+)"/g
        )];

        for (const match of directCalls) {
          const key = match[1];
          if (financialKeys.includes(key)) {
            // Check this isn't inside the invalidateAllFinancialQueries function itself
            // or inside a non-financial mutation (e.g. useUpdateAdminConfig) that
            // intentionally only refreshes the config cache, not the full financial cascade
            const idx = match.index!;
            const before = content.slice(Math.max(0, idx - 500), idx);
            const isInCentralizedHelper = before.includes("function invalidateAllFinancialQueries");
            const isInNonFinancialMutation = NON_FINANCIAL_MUTATIONS.some(m => before.includes(`function ${m}`));
            if (!isInCentralizedHelper && !isInNonFinancialMutation) {
              expect.fail(
                `${fileName}: Direct invalidateQueries call for "${key}" bypasses ` +
                `the centralized helper. Use invalidateAllFinancialQueries(queryClient) instead.`
              );
            }
          }
        }
      }
    });

    it("non-financial mutations use direct invalidation (not the centralized helper)", () => {
      // Verify the non-financial mutations invalidate their own specific keys
      for (const hookName of NON_FINANCIAL_MUTATIONS) {
        const file = findHookFile(hookName);
        if (!file) continue;
        const body = extractHookBody(file.content, hookName);
        if (!body) continue;
        // They should have some form of invalidation (queryClient.invalidateQueries)
        expect(
          body.includes("invalidateQueries"),
          `${hookName} should still invalidate its own query key`
        ).toBe(true);
      }
    });
  });

  // ─── invalidateAllFinancialQueries function structure ───
  describe("invalidateAllFinancialQueries function integrity", () => {
    it("iterates over ALL_FINANCIAL_QUERY_KEYS", () => {
      const propertiesContent = readApiFile("properties.ts");
      const funcBody = extractHookBody(propertiesContent, "invalidateAllFinancialQueries" as any);
      // It's not a hook, so extract manually
      const funcStart = propertiesContent.indexOf("export function invalidateAllFinancialQueries");
      expect(funcStart).toBeGreaterThan(-1);
      const funcEnd = propertiesContent.indexOf("}", funcStart);
      const body = propertiesContent.slice(funcStart, funcEnd + 1);

      expect(body).toContain("ALL_FINANCIAL_QUERY_KEYS");
      expect(body).toContain("invalidateQueries");
    });

    it("is exported from properties.ts", () => {
      const propertiesContent = readApiFile("properties.ts");
      expect(propertiesContent).toContain("export function invalidateAllFinancialQueries");
    });

    it("is imported by all files that use financial mutations", () => {
      const filesWithFinancialMutations = new Set<string>();
      for (const hookName of FINANCIAL_MUTATIONS) {
        const file = findHookFile(hookName);
        if (file && file.fileName !== "properties.ts") {
          filesWithFinancialMutations.add(file.fileName);
        }
      }

      for (const fileName of filesWithFinancialMutations) {
        const content = readApiFile(fileName);
        expect(
          content.includes("invalidateAllFinancialQueries"),
          `${fileName} has financial mutations but doesn't import invalidateAllFinancialQueries`
        ).toBe(true);
      }
    });
  });
});
