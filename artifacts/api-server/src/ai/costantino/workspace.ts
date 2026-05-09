/**
 * Costantino workspace filesystem helpers. Mirrors pietro/workspace.ts.
 * All paths resolve relative to the server's data root using
 * `path.resolve("costantino")`. Reads return safe empty values on ENOENT;
 * writes create parent directories as needed.
 */
import { promises as fs } from "fs";
import path from "path";

function costantinoDir(): string {
  return path.resolve("costantino");
}

function costantinoHealthFile(): string {
  return path.join(costantinoDir(), "health.md");
}

function costantinoRunHistoryDir(): string {
  return path.join(costantinoDir(), "run-history");
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

export async function readCostantinoHealth(): Promise<string> {
  return readFileOrEmpty(costantinoHealthFile());
}

export async function writeCostantinoHealth(content: string): Promise<void> {
  await ensureDir(costantinoDir());
  await fs.writeFile(costantinoHealthFile(), content, "utf-8");
}

export async function appendRunHistory(date: string, entry: string): Promise<void> {
  await ensureDir(costantinoRunHistoryDir());
  const filePath = path.join(costantinoRunHistoryDir(), `${date}.md`);
  await fs.appendFile(filePath, entry + "\n", "utf-8");
}
