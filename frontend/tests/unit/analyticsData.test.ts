import { describe, expect, it } from "vitest";
import {
  computeAcctCtr,
  computeAcctMsgCost,
  computeBestCpm,
  computeCpcDist,
  computeCtrDist,
  computeKpis,
  computeMsgByAccount,
  computeMsgCostDist,
  computeMsgRatio,
  computeMsgRoi,
  computeMsgShare,
  computeScatter,
  computeSpendByAccount,
  computeSpendDist,
  computeTopMsg,
} from "@/views/analytics/analyticsData";
import type { FbAccount, FbCampaign, FbInsights } from "@/types/fb";

/** Tiny builder for a campaign with insight values. */
function campaign(
  id: string,
  accountId: string,
  name: string,
  partial: Partial<FbInsights> & { msg7d?: number },
  overrides: Partial<FbCampaign> = {},
): FbCampaign {
  const actions = partial.msg7d
    ? [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: String(partial.msg7d) }]
    : [];
  return {
    id,
    name,
    status: "ACTIVE",
    _accountId: accountId,
    _accountName: `Account ${accountId}`,
    insights: {
      data: [{ ...partial, actions }],
    },
    ...overrides,
  };
}

const accA: FbAccount = { id: "act_1", name: "Alpha Retail", account_status: 1 };
const accB: FbAccount = { id: "act_2", name: "Bravo Beauty", account_status: 1 };
const visible: FbAccount[] = [accA, accB];

const defaultInsights: Record<string, FbInsights | null> = {
  act_1: { spend: "10000" },
  act_2: { spend: "5000" },
};

describe("computeKpis", () => {
  it("uses account-level spend when available", () => {
    const campaigns: FbCampaign[] = [];
    const kpis = computeKpis(campaigns, defaultInsights, visible);
    expect(kpis.totalSpend).toBe(15000);
    expect(kpis.activeCampaigns).toBe(0);
    expect(kpis.totalCampaigns).toBe(0);
  });

  it("counts active vs total campaigns", () => {
    const campaigns: FbCampaign[] = [
      campaign("1", "act_1", "A", { spend: "1000", ctr: "2" }),
      campaign("2", "act_1", "B", { spend: "500", ctr: "3" }, { status: "PAUSED" }),
    ];
    const kpis = computeKpis(campaigns, defaultInsights, visible);
    expect(kpis.activeCampaigns).toBe(1);
    expect(kpis.totalCampaigns).toBe(2);
    expect(kpis.avgCtr).toBe(2.5);
    expect(kpis.ctrSampleSize).toBe(2);
  });

  it("computes avgCostPerMsg only across campaigns with messages", () => {
    const campaigns: FbCampaign[] = [
      campaign("1", "act_1", "Msg-A", { spend: "2000", msg7d: 10 }),
      campaign("2", "act_1", "Msg-B", { spend: "3000", msg7d: 20 }),
      campaign("3", "act_1", "NoMsg", { spend: "50000" }), // excluded
    ];
    const kpis = computeKpis(campaigns, defaultInsights, visible);
    // msgSpend = 2000 + 3000 = 5000, msgCount = 30 → 166.666…
    expect(kpis.totalMsg).toBe(30);
    expect(Math.round(kpis.avgCostPerMsg)).toBe(167);
  });
});

describe("computeSpendByAccount", () => {
  it("sorts descending and slices to top 10", () => {
    const insights = {
      act_1: { spend: "300" },
      act_2: { spend: "500" },
    };
    const result = computeSpendByAccount([], insights, visible);
    expect(result.map((a) => a.value)).toEqual([500, 300]);
  });

  it("filters out 0-value accounts", () => {
    const insights = { act_1: { spend: "0" }, act_2: { spend: "100" } };
    const result = computeSpendByAccount([], insights, visible);
    expect(result).toHaveLength(1);
    expect(result[0]?.value).toBe(100);
  });
});

describe("computeMsgByAccount", () => {
  it("sums msg count per account and sorts desc", () => {
    const campaigns = [
      campaign("1", "act_1", "A", { msg7d: 5 }),
      campaign("2", "act_1", "B", { msg7d: 3 }),
      campaign("3", "act_2", "C", { msg7d: 10 }),
    ];
    const result = computeMsgByAccount(campaigns, visible);
    expect(result.map((a) => ({ id: a.name, v: a.value }))).toEqual([
      { id: "Bravo Beauty", v: 10 },
      { id: "Alpha Retail", v: 8 },
    ]);
  });
});

describe("computeCtrDist", () => {
  it("buckets CTR values; 0% excluded", () => {
    const campaigns = [
      campaign("1", "act_1", "A", { ctr: "0.5" }),
      campaign("2", "act_1", "B", { ctr: "1.2" }),
      campaign("3", "act_1", "C", { ctr: "4.9" }),
      campaign("4", "act_1", "D", { ctr: "6" }),
      campaign("5", "act_1", "E", { ctr: "0" }), // excluded
    ];
    const dist = computeCtrDist(campaigns);
    expect(dist.labels).toEqual(["0-1%", "1-2%", "2-3%", "3-5%", ">5%"]);
    expect(dist.values).toEqual([1, 1, 0, 1, 1]);
  });
});

describe("computeCpcDist / computeSpendDist / computeMsgCostDist", () => {
  it("buckets CPC correctly", () => {
    const campaigns = [
      campaign("1", "act_1", "A", { cpc: "2" }),
      campaign("2", "act_1", "B", { cpc: "7" }),
      campaign("3", "act_1", "C", { cpc: "55" }),
    ];
    const dist = computeCpcDist(campaigns);
    expect(dist.values).toEqual([1, 1, 0, 0, 1]);
  });

  it("buckets spend correctly", () => {
    const campaigns = [
      campaign("1", "act_1", "A", { spend: "500" }),
      campaign("2", "act_1", "B", { spend: "25000" }),
      campaign("3", "act_1", "C", { spend: "100000" }),
    ];
    const dist = computeSpendDist(campaigns);
    expect(dist.values).toEqual([1, 0, 0, 1, 1]);
  });

  it("buckets msg cost correctly (skips 0 msg/spend)", () => {
    const campaigns = [
      campaign("1", "act_1", "A", { spend: "500", msg7d: 10 }), // 50 → 0-100
      campaign("2", "act_1", "B", { spend: "1500", msg7d: 10 }), // 150 → 100-200
      campaign("3", "act_1", "C", { spend: "5000" }), // skipped (no msg)
    ];
    const dist = computeMsgCostDist(campaigns);
    expect(dist.values).toEqual([1, 1, 0, 0, 0]);
  });
});

describe("computeTopMsg / computeBestCpm / computeMsgRoi", () => {
  const msgCamps = [
    campaign("1", "act_1", "A", { spend: "1000", msg7d: 10 }), // cost 100, roi 10/K
    campaign("2", "act_1", "B", { spend: "500", msg7d: 20 }), // cost 25, roi 40/K
    campaign("3", "act_1", "C", { spend: "100000", msg7d: 5 }), // cost 20000, roi 0.05/K
  ];

  it("topMsg orders by msg count desc", () => {
    const result = computeTopMsg(msgCamps);
    expect(result.map((r) => r.campaign.id)).toEqual(["2", "1", "3"]);
  });

  it("bestCpm orders by cost asc", () => {
    const result = computeBestCpm(msgCamps);
    expect(result.map((r) => r.campaign.id)).toEqual(["2", "1", "3"]);
    expect(result[0]?.cost).toBe(25);
  });

  it("msgRoi orders by msgs per $1000 desc", () => {
    const result = computeMsgRoi(msgCamps);
    expect(result.map((r) => r.campaign.id)).toEqual(["2", "1", "3"]);
  });
});

describe("computeMsgRatio", () => {
  it("counts campaigns with vs without msg data (only those with spend)", () => {
    const campaigns = [
      campaign("1", "act_1", "A", { spend: "1000", msg7d: 5 }),
      campaign("2", "act_1", "B", { spend: "1000" }),
      campaign("3", "act_1", "C", { spend: "0", msg7d: 5 }), // skipped (no spend)
    ];
    const r = computeMsgRatio(campaigns);
    expect(r.withMsg).toBe(1);
    expect(r.withoutMsg).toBe(1);
  });
});

describe("computeScatter", () => {
  it("returns msg-cost mode when any campaign has msg data", () => {
    const campaigns = [
      campaign("1", "act_1", "A", { spend: "1000", msg7d: 10, ctr: "1" }),
      campaign("2", "act_1", "B", { spend: "500", ctr: "2" }),
    ];
    const r = computeScatter(campaigns);
    expect(r.isMsgCost).toBe(true);
    expect(r.data.map((p) => p.campaignName)).toEqual(["A"]);
  });

  it("falls back to CTR-vs-spend mode when no msg data", () => {
    const campaigns = [campaign("1", "act_1", "A", { spend: "1000", ctr: "2" })];
    const r = computeScatter(campaigns);
    expect(r.isMsgCost).toBe(false);
    expect(r.data[0]?.x).toBe(2);
    expect(r.data[0]?.y).toBe(1000);
  });
});

describe("computeAcctMsgCost / computeAcctCtr / computeMsgShare", () => {
  const perAcctCamps: FbCampaign[] = [
    campaign("1", "act_1", "A", { spend: "1000", msg7d: 10, impressions: "1000", clicks: "20" }),
    campaign("2", "act_1", "B", { spend: "500", msg7d: 10, impressions: "500", clicks: "5" }),
    campaign("3", "act_2", "C", { spend: "2000", msg7d: 40, impressions: "2000", clicks: "40" }),
  ];

  it("computeAcctMsgCost returns weighted cost sorted asc", () => {
    const r = computeAcctMsgCost(perAcctCamps, visible);
    // act_1: 1500/20 = 75, act_2: 2000/40 = 50
    expect(r).toEqual([
      { name: "Bravo Beauty", value: 50 },
      { name: "Alpha Retail", value: 75 },
    ]);
  });

  it("computeAcctCtr returns weighted ctr in % sorted desc", () => {
    const r = computeAcctCtr(perAcctCamps, visible);
    // act_1: (25/1500)*100 = 1.67, act_2: (40/2000)*100 = 2
    expect(r[0]?.name).toBe("Bravo Beauty");
    expect(r[0]?.value).toBe(2);
    expect(r[1]?.value).toBeCloseTo(1.67, 2);
  });

  it("computeMsgShare returns top 8 by msg count with cleaned names", () => {
    const r = computeMsgShare(perAcctCamps, visible);
    // account with more messages first
    expect(r[0]?.value).toBe(40);
    expect(r[1]?.value).toBe(20);
  });
});
