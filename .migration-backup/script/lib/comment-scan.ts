/**
 * comment-scan.ts — Shared comment-aware text scanner for guardrail scripts.
 *
 * Used by `script/check-no-legacy-storage-urls.ts` and
 * `script/check-replit-independence.ts` (Task #530). The previous heuristic
 * — "is the trimmed start of the line `//`, `*`, or `/*`?" — missed two
 * realistic cases:
 *   1. Trailing comments on the same line as code:
 *        const x = 1; // see storage.googleapis.com
 *   2. Banned literals appearing on a continuation line of a `/* ... *​/`
 *      block where the line itself doesn't start with a comment marker:
 *        /​*
 *           See storage.googleapis.com for the legacy bucket shape.
 *         *​/
 *
 * The fix: walk each candidate file once with a tiny state machine that
 * tracks whether each byte is inside a `//` line comment, a `/​* … *​/`
 * block comment, or a string/template literal. Then we report only the
 * pattern matches whose start byte sits outside any comment range.
 *
 * The state machine is intentionally minimal: it does NOT try to be a
 * full TS/JS parser. It only needs to be correct enough that string and
 * template literals don't get confused for comments and vice-versa. Edge
 * cases that don't matter for our guardrails (regex literals that contain
 * `//`, JSX expression boundaries, etc.) are either handled or are not
 * present in the codebase the guards scan.
 */

export interface CommentRange {
  start: number;
  end: number;
}

type State =
  | "code"
  | "line_comment"
  | "block_comment"
  | "single_string"
  | "double_string"
  | "template_string";

/**
 * Compute the byte ranges of all `//` line and `/​* … *​/` block comments
 * in `source`. The returned ranges are half-open: `[start, end)`. The
 * `start` points at the opening `/`; `end` points one past the closing
 * `\n` (for line comments) or one past the closing `/` (for block
 * comments).
 *
 * String and template literals are tracked so that a `//` inside a
 * string is NOT treated as a comment, and a `"` inside a comment is
 * NOT treated as opening a string.
 */
export function findCommentRanges(source: string): CommentRange[] {
  const ranges: CommentRange[] = [];
  let state: State = "code";
  let commentStart = 0;
  // For template literals we may descend into `${ ... }` interpolations,
  // which contain code (which itself may contain comments and nested
  // template literals). Track the brace depth and the saved string state.
  const templateStack: { braceDepth: number }[] = [];
  let i = 0;
  const n = source.length;

  while (i < n) {
    const c = source[i];
    const next = i + 1 < n ? source[i + 1] : "";

    switch (state) {
      case "code": {
        if (c === "/" && next === "/") {
          state = "line_comment";
          commentStart = i;
          i += 2;
        } else if (c === "/" && next === "*") {
          state = "block_comment";
          commentStart = i;
          i += 2;
        } else if (c === '"') {
          state = "double_string";
          i++;
        } else if (c === "'") {
          state = "single_string";
          i++;
        } else if (c === "`") {
          state = "template_string";
          i++;
        } else if (
          c === "}" &&
          templateStack.length > 0 &&
          templateStack[templateStack.length - 1].braceDepth === 1
        ) {
          // End of a `${ ... }` interpolation; pop back to template state.
          templateStack.pop();
          state = "template_string";
          i++;
        } else if (c === "{" && templateStack.length > 0) {
          templateStack[templateStack.length - 1].braceDepth++;
          i++;
        } else if (c === "}" && templateStack.length > 0) {
          templateStack[templateStack.length - 1].braceDepth--;
          i++;
        } else {
          i++;
        }
        break;
      }
      case "line_comment": {
        if (c === "\n") {
          ranges.push({ start: commentStart, end: i + 1 });
          state = "code";
        }
        i++;
        break;
      }
      case "block_comment": {
        if (c === "*" && next === "/") {
          ranges.push({ start: commentStart, end: i + 2 });
          state = "code";
          i += 2;
        } else {
          i++;
        }
        break;
      }
      case "single_string": {
        if (c === "\\") {
          i += 2;
        } else if (c === "'") {
          state = "code";
          i++;
        } else if (c === "\n") {
          // Unterminated single-quote string — recover at newline so a
          // stray apostrophe doesn't swallow the rest of the file.
          state = "code";
          i++;
        } else {
          i++;
        }
        break;
      }
      case "double_string": {
        if (c === "\\") {
          i += 2;
        } else if (c === '"') {
          state = "code";
          i++;
        } else if (c === "\n") {
          state = "code";
          i++;
        } else {
          i++;
        }
        break;
      }
      case "template_string": {
        if (c === "\\") {
          i += 2;
        } else if (c === "`") {
          state = "code";
          i++;
        } else if (c === "$" && next === "{") {
          templateStack.push({ braceDepth: 1 });
          state = "code";
          i += 2;
        } else {
          i++;
        }
        break;
      }
    }
  }

  // If the source ended mid-line-comment (no trailing newline), close it.
  if (state === "line_comment") {
    ranges.push({ start: commentStart, end: n });
  }
  // Unterminated block comments are ignored on purpose — they would
  // indicate broken source, and we'd rather flag the literal than
  // silently swallow the rest of the file.

  return ranges;
}

/**
 * Returns true if byte position `pos` lies inside any of the ranges in
 * `ranges`. Ranges are assumed to be sorted by `start` and non-overlapping.
 */
export function isInsideComment(ranges: CommentRange[], pos: number): boolean {
  // Linear scan is fine for our scale (per-file, small range count).
  for (const r of ranges) {
    if (pos < r.start) return false;
    if (pos < r.end) return true;
  }
  return false;
}

export interface NonCommentMatch {
  /** 1-based line number of the match. */
  line: number;
  /** The full source line containing the match (no trailing newline). */
  text: string;
  /** Byte offset into `source` where the match starts. */
  index: number;
}

/**
 * Find all matches of `pattern` in `source` whose start byte is NOT inside
 * a `//` or `/​* … *​/` comment. The pattern is iterated globally; callers
 * should pass an unanchored regex.
 */
export function findNonCommentMatches(
  source: string,
  pattern: RegExp,
): NonCommentMatch[] {
  const ranges = findCommentRanges(source);
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : pattern.flags + "g";
  const re = new RegExp(pattern.source, flags);
  const out: NonCommentMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (m.index === re.lastIndex) {
      // Zero-width match — bump to avoid infinite loop.
      re.lastIndex++;
      continue;
    }
    if (isInsideComment(ranges, m.index)) continue;
    const lineStart = source.lastIndexOf("\n", m.index - 1) + 1;
    const nlAfter = source.indexOf("\n", m.index);
    const lineEnd = nlAfter === -1 ? source.length : nlAfter;
    const text = source.slice(lineStart, lineEnd);
    // 1-based line number = number of \n before m.index, plus 1.
    let line = 1;
    for (let i = 0; i < m.index; i++) if (source[i] === "\n") line++;
    out.push({ line, text, index: m.index });
  }
  return out;
}
