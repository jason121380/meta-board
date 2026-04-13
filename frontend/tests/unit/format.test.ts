import { describe, expect, it } from "vitest";
import { escHtml, fF, fM, fN, fP } from "@/lib/format";

describe("fN (number with thousands separators)", () => {
  it("formats integers with commas", () => {
    expect(fN(1234567)).toBe("1,234,567");
    expect(fN(0)).toBe("0");
  });
  it("formats decimals with fixed precision", () => {
    expect(fN(1234.5, 2)).toBe("1,234.50");
    expect(fN(1234.567, 1)).toBe("1,234.6");
  });
  it("returns em-dash for null/undefined/empty", () => {
    expect(fN(null)).toBe("—");
    expect(fN(undefined)).toBe("—");
    expect(fN("")).toBe("—");
  });
  it("accepts numeric strings", () => {
    expect(fN("5000")).toBe("5,000");
  });
});

describe("fM (money, integer only)", () => {
  it("rounds to nearest integer with comma separators", () => {
    expect(fM(1234.4)).toBe("1,234");
    expect(fM(1234.5)).toBe("1,235");
    expect(fM(0)).toBe("0");
  });
  it("returns em-dash for missing values", () => {
    expect(fM(null)).toBe("—");
    expect(fM("")).toBe("—");
  });
});

describe("fP (percentage)", () => {
  it("appends % and fixes to 2 decimals", () => {
    expect(fP(3.1416)).toBe("3.14%");
    expect(fP(0)).toBe("0.00%");
    expect(fP(100)).toBe("100.00%");
  });
  it("returns em-dash for missing values", () => {
    expect(fP(null)).toBe("—");
    expect(fP(undefined)).toBe("—");
  });
});

describe("fF (frequency, 2 decimals no %)", () => {
  it("formats with 2 decimals", () => {
    expect(fF(3.1416)).toBe("3.14");
    expect(fF(5)).toBe("5.00");
  });
  it("returns em-dash for missing values", () => {
    expect(fF(null)).toBe("—");
  });
});

describe("escHtml", () => {
  it("escapes HTML special characters", () => {
    expect(escHtml("<script>alert('x')</script>")).toBe(
      "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;",
    );
    expect(escHtml('a&b"c')).toBe("a&amp;b&quot;c");
  });
  it("returns empty string for falsy values", () => {
    expect(escHtml(null)).toBe("");
    expect(escHtml(undefined)).toBe("");
    expect(escHtml("")).toBe("");
    expect(escHtml(0)).toBe("");
  });
});
