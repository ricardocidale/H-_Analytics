import { saveFile } from "./saveFile";

export async function downloadCSV(content: string, filename: string): Promise<boolean> {
  try {
    const safeFilename = filename.replace(/[/\\:*?"<>|]/g, "_");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    await saveFile(blob, safeFilename);
    return true;
  } catch (e: unknown) {
    console.error("CSV download failed:", e);
    return false;
  }
}
