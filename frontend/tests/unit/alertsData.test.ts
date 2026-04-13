import { describe, expect, it } from "vitest";
import {
  computeAlertBuckets,
  fbCampaignLink,
  filterAlertEntries,
  sortAlertEntries,
} from "@/views/alerts/alertsData";
import type { FbCampaign, FbInsights } from "@/types/fb";

function campaign(
  id: string,
  name: string,
  partial: Partial<FbInsights> & { msg7d?: number },
  overrides: Partial<FbCampaign> = {},
): FbCampaign {
  const actions = partial.msg7d
    ? [
        {
          action_type: "onsite_conversion.messaging_conversation_started_7d",
          value: String(partial.msg7d),
        },
      ]
    : [];
  return {
    id,
    name,
    status: "ACTIVE",
    _accountId: "act_1",
    _accountName: "Test Account",
    insights: { data: [{ ...partial, actions }] },
    ...overrides,
  };
}

describe("computeAlertBuckets — rule evaluation", () => {
  it("P2 (msg cost > $200) goes into the msg bucket only", () => {
    const camps = [
      campaign("1", "私訊 A", { spend: "3000", msg7d: 10 }), // cost 300 → P2
      campaign("2", "私訊 B", { spend: "1000", msg7d: 10 }), // cost 100 → no alert
    ];
    const b = computeAlertBuckets(camps);
    expect(b.msg).toHaveLength(1);
    expect(b.msg[0]?.tag).toBe("私訊成本過高");
    expect(b.cpc).toHaveLength(0);
    expect(b.freq).toHaveLength(0);
  });

  it("P3 (CPC > $5) and W3 (CPC $4-5) both go into cpc bucket, ACTIVE only", () => {
    const camps = [
      campaign("1", "A", { cpc: "6" }), // P3
      campaign("2", "B", { cpc: "4.5" }), // W3
      campaign("3", "C", { cpc: "3.9" }), // no alert
      campaign("4", "D", { cpc: "6" }, { status: "PAUSED" }), // not ACTIVE — skipped
    ];
    const b = computeAlertBuckets(camps);
    expect(b.cpc.map((e) => e.tag).sort()).toEqual(["CPC 偏高", "CPC 過高"]);
    expect(b.cpc.find((e) => e.tag === "CPC 過高")?.campaign.id).toBe("1");
    expect(b.cpc.find((e) => e.tag === "CPC 偏高")?.campaign.id).toBe("2");
  });

  it("P4 (freq > 5, spend > $1000) and W4 (freq 4-5, spend > $500) populate freq", () => {
    const camps = [
      campaign("1", "A", { frequency: "6", spend: "2000" }), // P4
      campaign("2", "B", { frequency: "5", spend: "2000" }), // boundary — 5 is not > 5, so W4 (4<f<=5)
      campaign("3", "C", { frequency: "6", spend: "500" }), // spend not > 1000 — no P4
      campaign("4", "D", { frequency: "4.5", spend: "600" }), // W4
      campaign("5", "E", { frequency: "3", spend: "2000" }), // no alert
    ];
    const b = computeAlertBuckets(camps);
    const p4 = b.freq.filter((e) => e.tag === "頻次過高");
    const w4 = b.freq.filter((e) => e.tag === "頻次偏高");
    expect(p4.map((e) => e.campaign.id)).toEqual(["1"]);
    expect(w4.map((e) => e.campaign.id).sort()).toEqual(["2", "4"]);
  });

  it("PAUSED campaigns are excluded from P3/W3/P4/W4 (ACTIVE-only rules)", () => {
    const camps = [
      campaign("1", "A", { cpc: "10", frequency: "8", spend: "5000" }, { status: "PAUSED" }),
    ];
    const b = computeAlertBuckets(camps);
    expect(b.cpc).toHaveLength(0);
    expect(b.freq).toHaveLength(0);
  });

  it("P2 fires regardless of status (legacy behavior)", () => {
    // P2's filter doesn't check status, so archived/paused with msg cost > 200 still
    // surface in the msg bucket. Keep it that way for parity.
    const camps = [
      campaign(
        "1",
        "paused msg",
        { spend: "3000", msg7d: 10 },
        { status: "PAUSED" },
      ),
    ];
    const b = computeAlertBuckets(camps);
    expect(b.msg).toHaveLength(1);
  });
});

describe("sortAlertEntries", () => {
  const entries = computeAlertBuckets([
    campaign("1", "A", { cpc: "6" }),
    campaign("2", "B", { cpc: "9" }),
    campaign("3", "C", { cpc: "7" }),
  ]).cpc;

  it("sorts by numeric column desc (dir=-1)", () => {
    const sorted = sortAlertEntries(entries, { key: "cpc", dir: -1 });
    expect(sorted.map((e) => e.campaign.id)).toEqual(["2", "3", "1"]);
  });

  it("sorts by numeric column asc (dir=1)", () => {
    const sorted = sortAlertEntries(entries, { key: "cpc", dir: 1 });
    expect(sorted.map((e) => e.campaign.id)).toEqual(["1", "3", "2"]);
  });

  it("sorts by campaign name alphabetically", () => {
    const sorted = sortAlertEntries(entries, { key: "campaign", dir: 1 });
    expect(sorted.map((e) => e.campaign.name)).toEqual(["A", "B", "C"]);
  });
});

describe("filterAlertEntries", () => {
  const msgEntries = computeAlertBuckets([
    campaign("1", "私訊 成效", { spend: "3000", msg7d: 10 }),
    campaign("2", "接單私訊", { spend: "3000", msg7d: 10 }), // has 接
    campaign("3", "流量 campaign", { spend: "3000", msg7d: 10 }), // no 私訊
  ]).msg;

  it("msg card with filter includes only names containing 私訊 and NOT 接", () => {
    const filtered = filterAlertEntries(msgEntries, "msg", true);
    expect(filtered.map((e) => e.campaign.id)).toEqual(["1"]);
  });

  it("msg card with filter=false returns everything", () => {
    const filtered = filterAlertEntries(msgEntries, "msg", false);
    expect(filtered).toHaveLength(3);
  });

  it("cpc card filter excludes names containing 私訊", () => {
    const entries = computeAlertBuckets([
      campaign("1", "私訊 cpc", { cpc: "6" }),
      campaign("2", "general cpc", { cpc: "6" }),
    ]).cpc;
    const filtered = filterAlertEntries(entries, "cpc", true);
    expect(filtered.map((e) => e.campaign.id)).toEqual(["2"]);
  });

  it("freq card has no filter — always returns everything", () => {
    const entries = computeAlertBuckets([
      campaign("1", "私訊 freq", { frequency: "6", spend: "2000" }),
    ]).freq;
    expect(filterAlertEntries(entries, "freq", true)).toHaveLength(1);
    expect(filterAlertEntries(entries, "freq", false)).toHaveLength(1);
  });
});

describe("fbCampaignLink", () => {
  it("builds an adsmanager URL with act_ prefix stripped", () => {
    const entry = computeAlertBuckets([campaign("cmp_9", "A", { cpc: "6" })]).cpc[0];
    if (!entry) throw new Error("expected entry");
    const link = fbCampaignLink(entry);
    expect(link).toContain("act=1"); // act_1 → 1
    expect(link).toContain("selected_campaign_ids=cmp_9");
  });

  it("appends business_id when provided", () => {
    const entry = computeAlertBuckets([campaign("cmp_9", "A", { cpc: "6" })]).cpc[0];
    if (!entry) throw new Error("expected entry");
    const link = fbCampaignLink(entry, "biz_42");
    expect(link).toContain("business_id=biz_42");
  });
});
