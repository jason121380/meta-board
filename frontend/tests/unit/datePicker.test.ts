import { describe, expect, it } from "vitest";
import {
  DP_PRESETS,
  fmtDate,
  resolveRange,
  toApiParams,
  toLabel,
  type DateConfig,
} from "@/lib/datePicker";

const mkNow = (iso: string) => new Date(`${iso}T12:00:00`);

describe("fmtDate", () => {
  it("formats a Date in local YYYY-MM-DD", () => {
    expect(fmtDate(new Date(2026, 3, 13))).toBe("2026-04-13"); // April
    expect(fmtDate(new Date(2026, 0, 1))).toBe("2026-01-01"); // January
  });
});

describe("resolveRange", () => {
  const now = mkNow("2026-04-13"); // Monday

  it("today", () => {
    expect(resolveRange({ preset: "today", from: null, to: null }, now)).toEqual({
      start: "2026-04-13",
      end: "2026-04-13",
    });
  });

  it("yesterday", () => {
    expect(resolveRange({ preset: "yesterday", from: null, to: null }, now)).toEqual({
      start: "2026-04-12",
      end: "2026-04-12",
    });
  });

  it("last_7d includes today so the range is 6 days earlier", () => {
    expect(resolveRange({ preset: "last_7d", from: null, to: null }, now)).toEqual({
      start: "2026-04-07",
      end: "2026-04-13",
    });
  });

  it("last_30d", () => {
    expect(resolveRange({ preset: "last_30d", from: null, to: null }, now)).toEqual({
      start: "2026-03-15",
      end: "2026-04-13",
    });
  });

  it("last_90d", () => {
    expect(resolveRange({ preset: "last_90d", from: null, to: null }, now)).toEqual({
      start: "2026-01-14",
      end: "2026-04-13",
    });
  });

  it("this_month", () => {
    expect(resolveRange({ preset: "this_month", from: null, to: null }, now)).toEqual({
      start: "2026-04-01",
      end: "2026-04-13",
    });
  });

  it("last_month", () => {
    expect(resolveRange({ preset: "last_month", from: null, to: null }, now)).toEqual({
      start: "2026-03-01",
      end: "2026-03-31",
    });
  });

  it("custom returns user-picked dates", () => {
    expect(
      resolveRange({ preset: "custom", from: "2025-01-01", to: "2025-06-30" }, now),
    ).toEqual({ start: "2025-01-01", end: "2025-06-30" });
  });

  it("custom without complete dates falls back to today", () => {
    const cfg: DateConfig = { preset: "custom", from: null, to: null };
    expect(resolveRange(cfg, now)).toEqual({ start: "2026-04-13", end: "2026-04-13" });
  });
});

describe("toApiParams", () => {
  it("preset → date_preset query", () => {
    expect(toApiParams({ preset: "last_month", from: null, to: null })).toBe(
      "date_preset=last_month",
    );
  });
  it("custom → time_range JSON", () => {
    expect(
      toApiParams({ preset: "custom", from: "2026-01-01", to: "2026-01-31" }),
    ).toBe('time_range={"since":"2026-01-01","until":"2026-01-31"}');
  });
});

describe("toLabel", () => {
  it("returns preset label for known presets", () => {
    expect(toLabel({ preset: "this_month", from: null, to: null })).toBe("本月");
    expect(toLabel({ preset: "last_month", from: null, to: null })).toBe("上個月");
  });
  it("returns range text for custom", () => {
    expect(
      toLabel({ preset: "custom", from: "2026-01-01", to: "2026-01-31" }),
    ).toBe("2026-01-01 ~ 2026-01-31");
  });
});

describe("DP_PRESETS", () => {
  it("has the 7 documented presets in the exact legacy order", () => {
    expect(DP_PRESETS.map((p) => p.value)).toEqual([
      "today",
      "yesterday",
      "last_7d",
      "last_30d",
      "last_90d",
      "this_month",
      "last_month",
    ]);
  });
});
