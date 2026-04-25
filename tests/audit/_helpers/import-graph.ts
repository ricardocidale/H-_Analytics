/**
 * Static import-graph helpers for split-orchestrator audit tests.
 *
 * Walks TypeScript `import` / `export … from` / side-effect-`import` /
 * dynamic-`import()` statements from one or more entry files and follows
 * relative + path-aliased specifiers. External module specifiers (anything
 * that does not resolve to a file in the repo) are ignored.
 *
 * Aliases mirror `vitest.config.ts` / `tsconfig.json` so the resolver behaves
 * the same way as the test runner and the type-checker.
 *
 * Used by:
 *   - tests/audit/data-routing-orchestrator.test.ts
 *   - tests/audit/risk-intelligence-orchestrator.test.ts
 *   - tests/audit/icp-intelligence-orchestrator.test.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";

export const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

const ALIAS_MAP: Record<string, string> = {
  "@calc": path.join(REPO_ROOT, "calc"),
  "@domain": path.join(REPO_ROOT, "domain"),
  "@engine": path.join(REPO_ROOT, "engine"),
  "@statements": path.join(REPO_ROOT, "statements"),
  "@analytics": path.join(REPO_ROOT, "analytics"),
  "@shared": path.join(REPO_ROOT, "shared"),
  "@/lib": path.join(REPO_ROOT, "client/src/lib"),
  "@/components": path.join(REPO_ROOT, "client/src/components"),
  "@/hooks": path.join(REPO_ROOT, "client/src/hooks"),
  "@": path.join(REPO_ROOT, "client/src"),
};

const ALIAS_KEYS = Object.keys(ALIAS_MAP).sort((a, b) => b.length - a.length);

function resolveAlias(specifier: string): string | null {
  for (const key of ALIAS_KEYS) {
    if (specifier === key) return ALIAS_MAP[key];
    if (specifier.startsWith(key + "/")) {
      return path.join(ALIAS_MAP[key], specifier.slice(key.length + 1));
    }
  }
  return null;
}

function tryResolveFile(absPath: string): string | null {
  const candidates = [
    absPath,
    `${absPath}.ts`,
    `${absPath}.tsx`,
    `${absPath}.js`,
    `${absPath}.jsx`,
    path.join(absPath, "index.ts"),
    path.join(absPath, "index.tsx"),
    path.join(absPath, "index.js"),
  ];
  for (const c of candidates) {
    try {
      const stat = fs.statSync(c);
      if (stat.isFile()) return c;
    } catch {
      /* missing file — try next */
    }
  }
  return null;
}

export function resolveImport(specifier: string, fromFile: string): string | null {
  if (specifier.startsWith(".")) {
    const base = path.resolve(path.dirname(fromFile), specifier);
    return tryResolveFile(base);
  }
  const aliasResolved = resolveAlias(specifier);
  if (aliasResolved) return tryResolveFile(aliasResolved);
  return null;
}

const FROM_IMPORT_RE = /(?:^|\s|;|})(?:import|export)\b[\s\S]*?\bfrom\s+["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT_RE = /(?:^|\s|;|})import\s+["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

export function collectImports(filePath: string): string[] {
  const src = fs.readFileSync(filePath, "utf-8");
  // Strip line + block comments to avoid matching example strings inside docs.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const out = new Set<string>();
  for (const re of [FROM_IMPORT_RE, SIDE_EFFECT_IMPORT_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0;
    for (const m of stripped.matchAll(re)) out.add(m[1]);
  }
  return [...out];
}

export interface ReachOptions {
  /**
   * If supplied, traversal stops descending into files whose absolute path
   * does not satisfy `shouldDescend`. The file itself is still recorded as
   * reached. Useful to scope the walk to a subtree (e.g. only follow imports
   * inside `server/ai/risk/`) so the graph stays bounded.
   */
  shouldDescend?: (absPath: string) => boolean;
}

export function collectReachableFiles(entryFiles: string[], opts: ReachOptions = {}): Set<string> {
  const visited = new Set<string>();
  const queue = [...entryFiles];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    if (opts.shouldDescend && !opts.shouldDescend(current)) continue;
    for (const spec of collectImports(current)) {
      const resolved = resolveImport(spec, current);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }
  return visited;
}

export function listTsFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTsFilesRecursive(p));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}
