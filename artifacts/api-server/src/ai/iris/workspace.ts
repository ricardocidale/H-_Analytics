/**
 * Iris workspace filesystem helpers.
 *
 * All paths resolve relative to the server's data root using `path.resolve("iris")`,
 * mirroring the pattern in `knowledge-base.ts` which uses `path.resolve("attached_assets")`.
 *
 * Paths are resolved lazily (inside each function call) so that tests can override
 * `process.cwd()` via vi.spyOn before the functions are invoked.
 *
 * All read helpers return a safe empty value when the file is absent — they never throw
 * on ENOENT. Write helpers create any missing parent directories before writing.
 */

import { promises as fs } from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Path helpers (lazy — resolved at call time so tests can redirect cwd)
// ---------------------------------------------------------------------------

function irisDir(): string {
  return path.resolve("iris");
}

function irisContextFile(): string {
  return path.join(irisDir(), "context.md");
}

function irisHealthFile(): string {
  return path.join(irisDir(), "health.md");
}

function irisGapsFile(): string {
  return path.join(irisDir(), "gaps.md");
}

function irisRunHistoryDir(): string {
  return path.join(irisDir(), "run-history");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Ensures `dir` exists (mkdir -p). */
async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Reads a text file, returning `""` if it does not exist.
 * All other errors propagate to the caller.
 */
async function readFileOrEmpty(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// context.md
// ---------------------------------------------------------------------------

/** Reads `iris/context.md`. Returns `""` if absent — never throws. */
export async function readIrisContext(): Promise<string> {
  return readFileOrEmpty(irisContextFile());
}

/** Writes `content` to `iris/context.md`, creating the directory if needed. */
export async function writeIrisContext(content: string): Promise<void> {
  await ensureDir(irisDir());
  await fs.writeFile(irisContextFile(), content, "utf-8");
}

// ---------------------------------------------------------------------------
// health.md
// ---------------------------------------------------------------------------

/** Reads `iris/health.md`. Returns `""` if absent — never throws. */
export async function readIrisHealth(): Promise<string> {
  return readFileOrEmpty(irisHealthFile());
}

/** Writes `content` to `iris/health.md`, creating the directory if needed. */
export async function writeIrisHealth(content: string): Promise<void> {
  await ensureDir(irisDir());
  await fs.writeFile(irisHealthFile(), content, "utf-8");
}

// ---------------------------------------------------------------------------
// gaps.md
// ---------------------------------------------------------------------------

/**
 * Reads `iris/gaps.md`, splits on newlines, and filters blank lines.
 * Returns `[]` if the file is absent — never throws.
 */
export async function readIrisGaps(): Promise<string[]> {
  const raw = await readFileOrEmpty(irisGapsFile());
  if (!raw) return [];
  return raw.split("\n").filter((line) => line.trim() !== "");
}

/**
 * Appends `query` as a new line to `iris/gaps.md` using atomic append mode.
 * Safe under concurrent writes — does NOT read-modify-write.
 */
export async function appendIrisGap(query: string): Promise<void> {
  await ensureDir(irisDir());
  await fs.appendFile(irisGapsFile(), query + "\n", "utf-8");
}

/**
 * Truncates `iris/gaps.md` to empty.
 * Uses writeFile rather than deletion to avoid ENOENT races with concurrent appenders.
 */
export async function clearIrisGaps(): Promise<void> {
  await ensureDir(irisDir());
  await fs.writeFile(irisGapsFile(), "", "utf-8");
}

// ---------------------------------------------------------------------------
// run-history/{date}.md
// ---------------------------------------------------------------------------

/**
 * Appends `entry` to `iris/run-history/{date}.md`, creating the file if absent.
 * The `date` parameter should be an ISO date string such as `"2026-05-06"`.
 */
export async function appendRunHistory(date: string, entry: string): Promise<void> {
  await ensureDir(irisRunHistoryDir());
  const filePath = path.join(irisRunHistoryDir(), `${date}.md`);
  await fs.appendFile(filePath, entry + "\n", "utf-8");
}
