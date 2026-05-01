/**
 * Skill-path drift detector — proof test enforcing referential integrity
 * of the skills/rules routing layer.
 *
 * Background: 2026-04-30 audit found 18 broken path references across
 * `context-loading/SKILL.md`, `design-standards.md`, and 6 other files.
 * Root cause: skills got reorganized into subdirectories (`ui/`,
 * `architecture/`, `integrations/`, etc.) but every file referencing the
 * old paths silently rotted. No error was thrown — the agent just read
 * nothing when trying to load the named skill.
 *
 * This test scans every `.md` file under `.claude/skills/` and
 * `.claude/rules/` for backtick-quoted file references and asserts each
 * referenced file exists on disk. New broken paths fail the build.
 *
 * Suggested in `.claude/rules/cross-check-invariants.md` § "Pattern 1 —
 * Contract drift via `any`" generalized to skill-routing drift.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const SKILLS_DIR = path.join(ROOT, ".claude/skills");
const RULES_DIR = path.join(ROOT, ".claude/rules");

// Recursively collect .md files under a directory
function collectMdFiles(dir: string, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMdFiles(full, results);
    } else if (entry.name.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}

// Match backtick-quoted strings ending in `.md`. The path must contain a
// `/` to count (filters out inline `.md` mentions).
const PATH_REF_REGEX = /`([^`\s]+\.md)`/g;

interface PathRef {
  file: string;
  line: number;
  raw: string;
}

function extractPathRefs(filePath: string): PathRef[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const refs: PathRef[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const match of line.matchAll(PATH_REF_REGEX)) {
      refs.push({ file: filePath, line: i + 1, raw: match[1] });
    }
  }
  return refs;
}

// Classify a raw path reference. Returns either:
//   - an array of candidate on-disk locations (path is valid if ANY exist)
//   - null if the reference should be ignored (URL, glob, example, etc.)
//
// Markdown across skills/rules uses several conventions for paths:
//   • `.claude/foo/bar.md`       — explicit, resolves from repo root
//   • `docs/foo.md`              — repo-root path (docs/, tests/, script/, engine/, etc.)
//   • `ui/charts.md`             — bare path, conventionally relative to .claude/skills/
//   • `rules/foo.md`             — bare path, conventionally relative to .claude/
//
// We try all reasonable roots and pass if the file exists in any of them.
function resolveRefCandidates(raw: string, sourceFile: string): string[] | null {
  if (!raw.includes("/")) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return null;
  if (raw.includes("*")) return null;
  if (raw.endsWith(")")) return null;

  // Hypothetical examples in instruction text
  if (raw.startsWith("path/to/")) return null;
  if (raw.startsWith("foo/")) return null;
  if (raw.startsWith("bar/")) return null;
  if (raw.startsWith("<") || raw.includes(">")) return null;

  // Negative-example paths used to say "don't put files here"
  // (e.g., documentation.md cites `/CLAUDE.md` as a forbidden location)
  if (raw.startsWith("/")) return null;

  // Absolute paths starting with `.claude/` resolve from repo root only
  if (raw.startsWith(".claude/")) {
    return [path.join(ROOT, raw)];
  }

  // Relative `./` paths resolve from the source file's directory
  if (raw.startsWith("./")) {
    return [path.join(path.dirname(sourceFile), raw)];
  }

  // For bare paths, try multiple roots — the path is valid if any resolves.
  return [
    path.join(ROOT, raw),                  // workspace root (e.g., docs/foo.md)
    path.join(SKILLS_DIR, raw),            // .claude/skills/ (e.g., ui/charts.md)
    path.join(ROOT, ".claude", raw),       // .claude/ (e.g., rules/foo.md)
    path.join(path.dirname(sourceFile), raw), // sibling of source file
  ];
}

// Allow-list: raw path strings that are intentionally not real files
// (template placeholders, deprecated paths kept for historical
// reference, illustrative examples). Each entry needs a one-line
// justification.
const ALLOW_LIST: ReadonlySet<string> = new Set([
  // (none currently — extend as needed)
]);

describe("Skill-path drift — every backtick-quoted .md reference resolves", () => {
  const skillFiles = collectMdFiles(SKILLS_DIR);
  const ruleFiles = collectMdFiles(RULES_DIR);
  const allFiles = [...skillFiles, ...ruleFiles];

  it("scan finds at least 50 markdown files (sanity check)", () => {
    expect(allFiles.length).toBeGreaterThan(50);
  });

  it("every backtick-quoted .md reference points to a file that exists", () => {
    const broken: { source: string; line: number; raw: string; resolved: string }[] = [];

    for (const filePath of allFiles) {
      const refs = extractPathRefs(filePath);
      for (const ref of refs) {
        if (ALLOW_LIST.has(ref.raw)) continue;
        const candidates = resolveRefCandidates(ref.raw, ref.file);
        if (candidates === null) continue;
        const exists = candidates.some((c) => fs.existsSync(c));
        if (!exists) {
          broken.push({
            source: path.relative(ROOT, ref.file),
            line: ref.line,
            raw: ref.raw,
            resolved: candidates.map((c) => path.relative(ROOT, c)).join(" | "),
          });
        }
      }
    }

    if (broken.length > 0) {
      const lines = broken.map(
        (b) => `  ${b.source}:${b.line} → \`${b.raw}\` (resolved: ${b.resolved})`,
      );
      throw new Error(
        `Found ${broken.length} broken skill/rule path reference${broken.length === 1 ? "" : "s"}:\n${lines.join("\n")}\n\n` +
          `Either fix the path, or if the reference is a non-file pattern (template placeholder,\n` +
          `illustrative example), add the raw string to ALLOW_LIST in this test with a justification.`,
      );
    }

    expect(broken).toEqual([]);
  });
});
