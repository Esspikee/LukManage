import { describe, expect, it } from "vitest";
import { normalizeLabel, parseCsv, toCsv, toNumber } from "./format";

describe("toNumber", () => {
  it("parses currency strings from the source sheet", () => {
    expect(toNumber(" $  2,434,714.12 ")).toBe(2434714.12);
    expect(toNumber("$63,546.00")).toBe(63546);
  });

  it("handles negatives and plain numbers", () => {
    expect(toNumber("-1500")).toBe(-1500);
    expect(toNumber("1500")).toBe(1500);
  });

  it("returns 0 for null or non-numeric input", () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber("abc")).toBe(0);
    expect(toNumber("")).toBe(0);
  });
});

describe("normalizeLabel", () => {
  it("trims and collapses internal whitespace", () => {
    expect(normalizeLabel("  Ahorro   Lulo ")).toBe("Ahorro Lulo");
    expect(normalizeLabel("\tGas\n")).toBe("Gas");
  });

  it("returns an empty string for nullish input", () => {
    expect(normalizeLabel(null)).toBe("");
  });
});

describe("toCsv", () => {
  it("quotes cells containing commas, quotes, or newlines", () => {
    const out = toCsv([
      ["a", "b,c", 'he said "hi"'],
      ["line1\nline2", 1, 2],
    ]);
    expect(out).toBe('a,"b,c","he said ""hi"""\n"line1\nline2",1,2');
  });

  it("leaves simple cells unquoted", () => {
    expect(toCsv([["name", "balance"], ["Lulo", 100]])).toBe("name,balance\nLulo,100");
  });
});

describe("parseCsv", () => {
  it("round-trips quoted fields with embedded commas and quotes", () => {
    const rows = parseCsv('a,"b,c","he said ""hi"""\n1,2,3');
    expect(rows).toEqual([
      ["a", "b,c", 'he said "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("handles CRLF line endings and skips blank lines", () => {
    const rows = parseCsv("h1,h2\r\n1,2\r\n\r\n3,4\r\n");
    expect(rows).toEqual([
      ["h1", "h2"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("preserves newlines inside quoted cells", () => {
    const rows = parseCsv('"a\nb",c');
    expect(rows).toEqual([["a\nb", "c"]]);
  });
});
