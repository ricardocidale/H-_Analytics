/**
 * Unit tests for the Iris workspace filesystem helpers (U1).
 *
 * Each test suite isolates all filesystem writes inside a temporary directory.
 * Because workspace.ts resolves paths lazily (inside each function call), a
 * vi.spyOn on process.cwd() before the first call is sufficient to redirect
 * all I/O to the temp dir — no module cache tricks are needed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import os from "os";
import path from "path";
import { promises as fs } from "fs";

import {
  readIrisContext,
  writeIrisContext,
  readIrisHealth,
  writeIrisHealth,
  readIrisGaps,
  appendIrisGap,
  clearIrisGaps,
  appendRunHistory,
} from "../../../ai/iris/workspace";

// ---------------------------------------------------------------------------
// Isolation: redirect process.cwd() to a per-test temp dir so that
// path.resolve("iris") in workspace.ts never touches the real repository tree.
// ---------------------------------------------------------------------------

let tmpDir: string;
let cwdSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "iris-test-"));
  cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
});

afterEach(async () => {
  cwdSpy.mockRestore();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// Maximum number of concurrent appends used for the concurrency test.
const CONCURRENT_APPEND_COUNT = 50;

// ---------------------------------------------------------------------------
// context.md
// ---------------------------------------------------------------------------

describe("readIrisContext / writeIrisContext", () => {
  it("returns empty string when the file does not exist", async () => {
    const result = await readIrisContext();
    expect(result).toBe("");
  });

  it("write then read returns the written content", async () => {
    const content = "# Context\nSome iris context data.";
    await writeIrisContext(content);
    const result = await readIrisContext();
    expect(result).toBe(content);
  });

  it("overwrites previous content on second write", async () => {
    await writeIrisContext("first");
    await writeIrisContext("second");
    expect(await readIrisContext()).toBe("second");
  });
});

// ---------------------------------------------------------------------------
// health.md
// ---------------------------------------------------------------------------

describe("readIrisHealth / writeIrisHealth", () => {
  it("returns empty string when the file does not exist", async () => {
    expect(await readIrisHealth()).toBe("");
  });

  it("write then read returns the written content", async () => {
    const content = "# Health\nAll systems nominal.";
    await writeIrisHealth(content);
    expect(await readIrisHealth()).toBe(content);
  });
});

// ---------------------------------------------------------------------------
// gaps.md
// ---------------------------------------------------------------------------

describe("readIrisGaps / appendIrisGap / clearIrisGaps", () => {
  it("returns empty array when the file does not exist", async () => {
    expect(await readIrisGaps()).toEqual([]);
  });

  it("appendIrisGap called three times → readIrisGaps returns three entries", async () => {
    await appendIrisGap("gap one");
    await appendIrisGap("gap two");
    await appendIrisGap("gap three");
    const gaps = await readIrisGaps();
    expect(gaps).toHaveLength(3);
    expect(gaps).toEqual(["gap one", "gap two", "gap three"]);
  });

  it("clearIrisGaps after append → readIrisGaps returns empty array", async () => {
    await appendIrisGap("some gap");
    await clearIrisGaps();
    expect(await readIrisGaps()).toEqual([]);
  });

  it("concurrent appendIrisGap calls produce correct number of intact lines", async () => {
    // Fire CONCURRENT_APPEND_COUNT appends simultaneously.
    const tasks = Array.from(
      { length: CONCURRENT_APPEND_COUNT },
      (_, i) => appendIrisGap(`concurrent-line-${i}`)
    );
    await Promise.all(tasks);

    const gaps = await readIrisGaps();

    // Every line must be a complete, recognisable entry — no partial writes.
    expect(gaps).toHaveLength(CONCURRENT_APPEND_COUNT);
    for (const line of gaps) {
      expect(line).toMatch(/^concurrent-line-\d+$/);
    }
  });
});

// ---------------------------------------------------------------------------
// run-history/{date}.md
// ---------------------------------------------------------------------------

describe("appendRunHistory", () => {
  it("creates the file when it does not yet exist", async () => {
    const date = "2026-05-06";
    await appendRunHistory(date, "First run entry");

    const filePath = path.join(tmpDir, "iris", "run-history", `${date}.md`);
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("First run entry");
  });

  it("appends multiple entries to the same date file", async () => {
    const date = "2026-05-06";
    await appendRunHistory(date, "Entry A");
    await appendRunHistory(date, "Entry B");

    const filePath = path.join(tmpDir, "iris", "run-history", `${date}.md`);
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("Entry A");
    expect(content).toContain("Entry B");
  });

  it("keeps separate files for different dates", async () => {
    await appendRunHistory("2026-05-06", "day one entry");
    await appendRunHistory("2026-05-07", "day two entry");

    const dir = path.join(tmpDir, "iris", "run-history");
    const files = await fs.readdir(dir);
    expect(files).toContain("2026-05-06.md");
    expect(files).toContain("2026-05-07.md");
  });
});
