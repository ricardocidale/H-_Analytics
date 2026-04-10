import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeBrowserDownloadMocks } from "./helpers";

// downloadCSV uses browser APIs (document, Blob, URL.createObjectURL).
// We mock these globals directly since jsdom is not installed.

const mocks = makeBrowserDownloadMocks();
beforeEach(() => mocks.install());
afterEach(() => mocks.uninstall());

// Dynamic import so the module sees our mocked globals
async function getDownloadCSV() {
  const mod = await import("../../client/src/lib/exports/csvExport");
  return mod.downloadCSV;
}

describe("downloadCSV", () => {
  it("creates a Blob with text/csv MIME type", async () => {
    const downloadCSV = await getDownloadCSV();
    await downloadCSV("a,b,c\n1,2,3", "test.csv");

    expect(mocks.capturedBlob).toBeInstanceOf(Blob);
    expect(mocks.capturedBlob!.type).toBe("text/csv;charset=utf-8;");
  });

  it("sets the filename on the link element", async () => {
    const downloadCSV = await getDownloadCSV();
    await downloadCSV("header\nrow", "my-export.csv");
    expect(mocks.mockLink.download).toBe("my-export.csv");
  });

  it("sets href to the blob URL", async () => {
    const downloadCSV = await getDownloadCSV();
    await downloadCSV("data", "file.csv");
    expect(mocks.mockLink.href).toBe("blob:http://test/abc123");
  });

  it("triggers link click", async () => {
    const downloadCSV = await getDownloadCSV();
    await downloadCSV("data", "file.csv");
    expect(mocks.mockLink.click).toHaveBeenCalledOnce();
  });

  it("appends and removes the link from document body", async () => {
    vi.useFakeTimers();
    const downloadCSV = await getDownloadCSV();
    await downloadCSV("data", "file.csv");
    expect(document.body.appendChild).toHaveBeenCalledWith(mocks.mockLink);
    await vi.advanceTimersByTimeAsync(300);
    expect(document.body.removeChild).toHaveBeenCalledWith(mocks.mockLink);
    vi.useRealTimers();
  });

  it("revokes the object URL for cleanup", async () => {
    vi.useFakeTimers();
    const downloadCSV = await getDownloadCSV();
    await downloadCSV("data", "file.csv");
    await vi.advanceTimersByTimeAsync(300);
    expect(mocks.mockRevokeObjectURL).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("handles empty content", async () => {
    const downloadCSV = await getDownloadCSV();
    await downloadCSV("", "empty.csv");
    expect(mocks.mockLink.click).toHaveBeenCalledOnce();
  });

  it("handles content with special characters", async () => {
    const downloadCSV = await getDownloadCSV();
    const content = '"Name","Value"\n"O\'Brien","$1,000"';
    await downloadCSV(content, "special.csv");
    expect(mocks.mockLink.click).toHaveBeenCalledOnce();
  });

  it("returns true on success", async () => {
    const downloadCSV = await getDownloadCSV();
    const result = await downloadCSV("data", "file.csv");
    expect(result).toBe(true);
  });

  it("returns false on error", async () => {
    const downloadCSV = await getDownloadCSV();
    (document as any).createElement = () => { throw new Error("boom"); };
    const result = await downloadCSV("data", "file.csv");
    expect(result).toBe(false);
  });
});
