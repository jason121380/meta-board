import { buildCampaignRecommendations } from "@/lib/recommendations";
import { describe, expect, it } from "vitest";

/**
 * Mirror tests for the message-cost / CPC / frequency rules. These
 * are the same thresholds used by backend `_evaluate_alert_recommendations`
 * (main.py). Keeping them green in CI catches accidental drift between
 * the LINE flex push and the in-app share report.
 */

const base = { spend: 0, msgs: 0, msgCost: 0, cpc: 0, frequency: 0 };

describe("buildCampaignRecommendations — 私訊優先", () => {
  it("私訊成本 < $100 → 非常好", () => {
    const out = buildCampaignRecommendations({ ...base, spend: 500, msgs: 10, msgCost: 50 });
    expect(out).toContain("私訊成本 $50 非常好,持續以私訊轉換為主軸");
  });

  it("私訊成本 100~200 → 平均值 維持現狀", () => {
    const out = buildCampaignRecommendations({ ...base, spend: 1500, msgs: 10, msgCost: 150 });
    expect(out[0]).toContain("為平均值,維持現狀即可");
  });

  it("私訊成本 200~300 → 偏高 待觀察", () => {
    const out = buildCampaignRecommendations({ ...base, spend: 2500, msgs: 10, msgCost: 250 });
    expect(out[0]).toContain("偏高,待觀察");
  });

  it("私訊成本 > $300 + CPC 不錯 → 檢視私訊回覆流程", () => {
    const out = buildCampaignRecommendations({
      ...base,
      spend: 5000,
      msgs: 10,
      msgCost: 500,
      cpc: 3,
    });
    expect(out[0]).toContain("CPC $3.00 表現不錯");
    expect(out[0]).toContain("檢視私訊回覆流程");
  });

  it("私訊成本 > $300 + CPC 也偏高 → 整體優化", () => {
    const out = buildCampaignRecommendations({
      ...base,
      spend: 5000,
      msgs: 10,
      msgCost: 500,
      cpc: 8,
    });
    expect(out[0]).toContain("CPC $8.00 也偏高");
    expect(out[0]).toContain("受眾與素材整體優化");
  });

  it("私訊成本太高時略過頻次警示", () => {
    const out = buildCampaignRecommendations({
      ...base,
      spend: 5000,
      msgs: 10,
      msgCost: 500,
      cpc: 3,
      frequency: 6, // would otherwise trigger 過高
    });
    expect(out.find((r) => r.includes("頻次"))).toBeUndefined();
  });
});

describe("buildCampaignRecommendations — 無私訊資料時看 CPC", () => {
  it("CPC ≤ $4 → 不評論", () => {
    const out = buildCampaignRecommendations({ ...base, spend: 500, cpc: 3 });
    expect(out.find((r) => r.includes("CPC"))).toBeUndefined();
  });

  it("CPC 4~5 → 偏高待觀察", () => {
    const out = buildCampaignRecommendations({ ...base, spend: 500, cpc: 4.5 });
    expect(out[0]).toContain("CPC $4.50 偏高,待觀察");
  });

  it("CPC 5~6 → 可以優化", () => {
    const out = buildCampaignRecommendations({ ...base, spend: 500, cpc: 5.5 });
    expect(out[0]).toContain("CPC $5.50 可以優化");
  });

  it("CPC > $6 → 太高 需要調整", () => {
    const out = buildCampaignRecommendations({ ...base, spend: 500, cpc: 7 });
    expect(out[0]).toContain("CPC $7.00 太高,需要調整");
  });
});

describe("buildCampaignRecommendations — 頻次警示", () => {
  it("頻次 > 5 + spend > $1000 → 過高", () => {
    const out = buildCampaignRecommendations({ ...base, spend: 1500, frequency: 6 });
    expect(out.find((r) => r.includes("過高,建議擴大受眾"))).toBeDefined();
  });

  it("頻次 4~5 + spend > $500 → 偏高", () => {
    const out = buildCampaignRecommendations({ ...base, spend: 800, frequency: 4.5 });
    expect(out.find((r) => r.includes("偏高,需留意素材疲勞"))).toBeDefined();
  });

  it("spend 太低時不觸發頻次警示", () => {
    const out = buildCampaignRecommendations({ ...base, spend: 100, frequency: 6 });
    expect(out.find((r) => r.includes("頻次"))).toBeUndefined();
  });
});

describe("buildCampaignRecommendations — 組合情境", () => {
  it("私訊好 + 頻次過高 → 兩條建議", () => {
    const out = buildCampaignRecommendations({
      spend: 1500,
      msgs: 30,
      msgCost: 50,
      cpc: 2,
      frequency: 6,
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toContain("非常好");
    expect(out[1]).toContain("過高");
  });

  it("沒任何規則觸發 → 空陣列", () => {
    const out = buildCampaignRecommendations({
      spend: 100,
      msgs: 5,
      msgCost: 20,
      cpc: 1,
      frequency: 1,
    });
    // msgCost < 100 一律出建議,所以這裡會有 1 筆
    expect(out).toHaveLength(1);
  });

  it("無花費無私訊 CPC 0 → 完全空", () => {
    const out = buildCampaignRecommendations(base);
    expect(out).toHaveLength(0);
  });
});
