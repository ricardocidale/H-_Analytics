/**
 * comment-scan.test.ts — Sanity tests for the comment-aware scanner used
 * by `script/check-no-legacy-storage-urls.ts` and
 * `script/check-replit-independence.ts` (Task #530).
 *
 * The cases below cover the two false-positive shapes that motivated the
 * refactor (trailing inline comments and continuation lines inside block
 * comments) and confirm we still flag literals in real string,
 * template-literal, and identifier positions.
 */
import { describe, it, expect } from "vitest";
import {
  findCommentRanges,
  findNonCommentMatches,
  isInsideComment,
} from "../../script/lib/comment-scan.ts";

const URL_RE = /storage\.googleapis\.com/g;

describe("findCommentRanges", () => {
  it("captures `//` line comments and `/* */` block comments", () => {
    const src = "const a = 1; // hi\n/* block */\nconst b = 2;\n";
    const ranges = findCommentRanges(src);
    expect(ranges.length).toBe(2);
    expect(src.slice(ranges[0].start, ranges[0].end)).toBe("// hi\n");
    expect(src.slice(ranges[1].start, ranges[1].end)).toBe("/* block */");
  });

  it("does not treat `//` inside a string as a comment", () => {
    const src = `const u = "https://x.com/y";\n`;
    const ranges = findCommentRanges(src);
    expect(ranges).toEqual([]);
  });

  it("does not treat `//` inside a template literal as a comment", () => {
    const src = "const u = `https://x.com/${id}`;\n";
    const ranges = findCommentRanges(src);
    expect(ranges).toEqual([]);
  });

  it("ignores comment markers inside template `${...}` interpolations only when they ARE comments", () => {
    // The `// hi` inside the interpolation IS a real line comment.
    const src = "const x = `${42 // hi\n}`;\n";
    const ranges = findCommentRanges(src);
    expect(ranges.length).toBe(1);
    expect(src.slice(ranges[0].start, ranges[0].end)).toBe("// hi\n");
  });
});

describe("findNonCommentMatches", () => {
  it("ignores trailing line comments after code (the bug Task #530 targets)", () => {
    const src = `const x = 1; // see storage.googleapis.com\n`;
    expect(findNonCommentMatches(src, URL_RE)).toEqual([]);
  });

  it("ignores continuation lines inside `/* */` block comments", () => {
    // The middle line has no comment marker at column 0, but it's inside
    // the block — the old line-prefix heuristic missed this case.
    const src = [
      "/*",
      "  See storage.googleapis.com for the legacy bucket shape.",
      " */",
      "const a = 1;",
      "",
    ].join("\n");
    expect(findNonCommentMatches(src, URL_RE)).toEqual([]);
  });

  it("ignores leading-`*` JSDoc continuation lines", () => {
    const src = [
      "/**",
      " * storage.googleapis.com is the legacy host.",
      " */",
      "",
    ].join("\n");
    expect(findNonCommentMatches(src, URL_RE)).toEqual([]);
  });

  it("flags literals in real string positions", () => {
    const src = `const u = "https://storage.googleapis.com/bucket/x";\n`;
    const hits = findNonCommentMatches(src, URL_RE);
    expect(hits.length).toBe(1);
    expect(hits[0].line).toBe(1);
  });

  it("flags literals in template literals", () => {
    const src = "const u = `https://storage.googleapis.com/${key}`;\n";
    const hits = findNonCommentMatches(src, URL_RE);
    expect(hits.length).toBe(1);
  });

  it("flags literals on the code half of a line that ALSO has a trailing comment", () => {
    const src = `const u = "storage.googleapis.com"; // ok in comment storage.googleapis.com\n`;
    const hits = findNonCommentMatches(src, URL_RE);
    // The trailing comment occurrence is filtered; the string-literal one is flagged.
    expect(hits.length).toBe(1);
    expect(hits[0].text).toContain(`"storage.googleapis.com"`);
  });

  it("reports correct 1-based line numbers across multi-line input", () => {
    const src = [
      "// line 1 mention storage.googleapis.com",
      "const a = 1;",
      `const b = "storage.googleapis.com";`,
      "",
    ].join("\n");
    const hits = findNonCommentMatches(src, URL_RE);
    expect(hits.length).toBe(1);
    expect(hits[0].line).toBe(3);
  });
});

describe("isInsideComment", () => {
  it("returns true for positions inside a range and false otherwise", () => {
    const ranges = [
      { start: 5, end: 10 },
      { start: 20, end: 25 },
    ];
    expect(isInsideComment(ranges, 0)).toBe(false);
    expect(isInsideComment(ranges, 5)).toBe(true);
    expect(isInsideComment(ranges, 9)).toBe(true);
    expect(isInsideComment(ranges, 10)).toBe(false);
    expect(isInsideComment(ranges, 22)).toBe(true);
    expect(isInsideComment(ranges, 30)).toBe(false);
  });
});
