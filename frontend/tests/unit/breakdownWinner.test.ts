import {
  type BreakdownRow,
  pickWinner,
} from "@/views/dashboard/BreakdownInsightStrip";
import { describe, expect, it } from "vitest";

const row = (
  key: string,
  spend: number,
  impressions: number,
  ctr: number,
  msgs = 0,
): BreakdownRow => ({ key, spend, impressions, ctr, msgs });

describe("pickWinner — 受眾洞察 winner 選擇", () => {
  it("空陣列 → null", () => {
    expect(pickWinner([])).toBeNull();
    expect(pickWinner(undefined)).toBeNull();
  });

  it("有私訊資料 → 選 msgCost 最低的 bucket", () => {
    const rows = [
      row("Facebook", 1000, 5000, 2.0, 5), // $200 / 私訊
      row("Instagram", 500, 2000, 1.5, 10), // $50 / 私訊 ← winner
      row("Audience", 0, 0, 0, 0),
    ];
    const w = pickWinner(rows);
    expect(w?.row.key).toBe("Instagram");
    expect(w?.metric).toBe("msgCost");
  });

  it("沒私訊但有 CTR (impressions ≥100) → 選 CTR 最高", () => {
    const rows = [
      row("Facebook", 1000, 10000, 1.5),
      row("Instagram", 800, 5000, 3.5), // ← winner
      row("Tiny", 1, 50, 100), // impressions <100 排除掉
    ];
    const w = pickWinner(rows);
    expect(w?.row.key).toBe("Instagram");
    expect(w?.metric).toBe("ctr");
  });

  it("CTR 池低樣本全被排除 → fallback 到 impressions 最高", () => {
    const rows = [
      row("A", 100, 50, 99),
      row("B", 50, 80, 50),
      row("C", 10, 30, 200), // impressions 太低 但仍是 fallback 候選
    ];
    const w = pickWinner(rows);
    expect(w?.metric).toBe("impressions");
    // B 有最高的 impressions (80) 在這三者中
    expect(w?.row.key).toBe("B");
  });

  it("優先看 msgCost,即使 CTR 更高的別組也被忽略", () => {
    const rows = [
      row("Facebook", 100, 10000, 5.0, 5), // $20 / msg ← winner
      row("Instagram", 100, 10000, 10.0, 0), // CTR 高但無私訊
    ];
    const w = pickWinner(rows);
    expect(w?.row.key).toBe("Facebook");
    expect(w?.metric).toBe("msgCost");
  });
});
