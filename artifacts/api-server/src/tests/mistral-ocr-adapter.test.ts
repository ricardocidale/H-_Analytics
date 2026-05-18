import { describe, it, expect } from "vitest";
import { parseMistralOcrPages, MISTRAL_OCR_TABLE_CONFIDENCE } from "../routes/documents";

describe("parseMistralOcrPages", () => {
  describe("page numbering", () => {
    it("converts 0-based Mistral index to 1-based pageNumber", () => {
      const result = parseMistralOcrPages([
        { index: 0, markdown: "| Key | Value |\n|---|---|\n| Rate | 0.08 |" },
        { index: 1, markdown: "| Key | Value |\n|---|---|\n| ADR | 250 |" },
      ]);
      expect(result.pages).toHaveLength(2);
      expect(result.pages[0].pageNumber).toBe(1);
      expect(result.pages[1].pageNumber).toBe(2);
    });

    it("preserves arbitrary index offsets in page numbering", () => {
      const result = parseMistralOcrPages([
        { index: 4, markdown: "| Key | Value |\n|---|---|\n| Cap | 0.09 |" },
      ]);
      expect(result.pages[0].pageNumber).toBe(5);
    });
  });

  describe("GFM separator-row skipping", () => {
    it("skips rows matching the separator pattern |---|---|", () => {
      const result = parseMistralOcrPages([
        { index: 0, markdown: "| Field | Amount |\n|---|---|\n| Rate | 5% |" },
      ]);
      // separator row must not appear in bodyRows
      const bodyRows = result.pages[0].tables[0].bodyRows;
      expect(bodyRows).toHaveLength(2); // header row + data row, no separator
      expect(bodyRows.every((row) => !row.some((cell) => /^-+$/.test(cell)))).toBe(true);
    });

    it("skips separator rows with colon alignment markers |:---|:---:|---:|", () => {
      const result = parseMistralOcrPages([
        { index: 0, markdown: "| A | B |\n|:---|:---:|\n| x | y |" },
      ]);
      const bodyRows = result.pages[0].tables[0].bodyRows;
      expect(bodyRows).toHaveLength(2);
    });

    it("skips separator rows with spaces | --- | --- |", () => {
      const result = parseMistralOcrPages([
        { index: 0, markdown: "| A | B |\n| --- | --- |\n| x | y |" },
      ]);
      const bodyRows = result.pages[0].tables[0].bodyRows;
      expect(bodyRows).toHaveLength(2);
    });
  });

  describe("key-value pair promotion", () => {
    it("promotes 2-column rows to keyValuePairs with MISTRAL_OCR_TABLE_CONFIDENCE", () => {
      const result = parseMistralOcrPages([
        {
          index: 0,
          markdown: "| Exit Cap Rate | 0.085 |\n|---|---|\n| Occupancy | 72% |",
        },
      ]);
      expect(result.keyValuePairs).toHaveLength(2);
      expect(result.keyValuePairs[0]).toEqual({
        key: "Exit Cap Rate",
        value: "0.085",
        confidence: MISTRAL_OCR_TABLE_CONFIDENCE,
      });
      expect(result.keyValuePairs[1]).toEqual({
        key: "Occupancy",
        value: "72%",
        confidence: MISTRAL_OCR_TABLE_CONFIDENCE,
      });
    });

    it("does not promote rows with more than 2 columns to keyValuePairs", () => {
      const result = parseMistralOcrPages([
        {
          index: 0,
          markdown: "| Field | Value | Notes |\n|---|---|---|\n| Rate | 5% | est |",
        },
      ]);
      expect(result.keyValuePairs).toHaveLength(0);
    });

    it("sets confidence exactly to MISTRAL_OCR_TABLE_CONFIDENCE (0.8)", () => {
      const result = parseMistralOcrPages([
        { index: 0, markdown: "| K | V |\n|---|---|\n| a | b |" },
      ]);
      expect(result.keyValuePairs[0].confidence).toBe(0.8);
    });
  });

  describe("page filtering", () => {
    it("omits pages with no table rows from result.pages", () => {
      const result = parseMistralOcrPages([
        { index: 0, markdown: "No tables here, just prose." },
        { index: 1, markdown: "| Key | Val |\n|---|---|\n| a | b |" },
      ]);
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].pageNumber).toBe(2);
    });

    it("returns empty pages and keyValuePairs for markdown with no pipe rows", () => {
      const result = parseMistralOcrPages([{ index: 0, markdown: "Just text." }]);
      expect(result.pages).toHaveLength(0);
      expect(result.keyValuePairs).toHaveLength(0);
    });
  });

  describe("text accumulation", () => {
    it("concatenates all page markdown into result.text", () => {
      const result = parseMistralOcrPages([
        { index: 0, markdown: "page one" },
        { index: 1, markdown: "page two" },
      ]);
      expect(result.text).toContain("page one");
      expect(result.text).toContain("page two");
    });
  });

  describe("empty input", () => {
    it("returns empty result for empty page array", () => {
      const result = parseMistralOcrPages([]);
      expect(result.text).toBe("");
      expect(result.pages).toHaveLength(0);
      expect(result.entities).toHaveLength(0);
      expect(result.keyValuePairs).toHaveLength(0);
    });
  });
});
