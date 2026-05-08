/**
 * Pietro workspace filesystem helpers.
 *
 * Mirrors iris/workspace.ts. All paths resolve relative to the server's
 * data root using `path.resolve("pietro")`. Reads return safe empty values
 * on ENOENT; writes create parent directories as needed.
 */
import { promises as fs } from "fs";
import path from "path";

function pietroDir(): string {
  return path.resolve("pietro");
}

function pietroHealthFile(): string {
  return path.join(pietroDir(), "health.md");
}

function pietroRunHistoryDir(): string {
  return path.join(pietroDir(), "run-history");
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function readFileOrEmpty(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  }
}

export async function readPietroHealth(): Promise<string> {
  return readFileOrEmpty(pietroHealthFile());
}

export async function writePietroHealth(content: string): Promise<void> {
  await ensureDir(pietroDir());
  await fs.writeFile(pietroHealthFile(), content, "utf-8");
}

export async function appendRunHistory(date: string, entry: string): Promise<void> {
  await ensureDir(pietroRunHistoryDir());
  const filePath = path.join(pietroRunHistoryDir(), `${date}.md`);
  await fs.appendFile(filePath, entry + "\n", "utf-8");
}
