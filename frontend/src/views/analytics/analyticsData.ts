import { getIns, getMsgCount, spendOf } from "@/lib/insights";
import type { FbAccount, FbCampaign, FbInsights } from "@/types/fb";

/**
 * Pure data aggregation for the Analytics view. Every function in
 * this module is deterministic and testable — no React, no Chart.js.
 *
 * All ports are of blocks inside `loadAiAnalysis()` (the original design
 * lines 2474–2752) and keep the exact same semantics:
 *  - First-found messaging count (never sums the two msg types)
 *  - Account spend is taken from account-level insights when available,
 *    falling back to sum-of-campaigns otherwise
 *  - All "top N" helpers return at most 10 items
 *  - Distribution buckets skip zero-valued campaigns so the charts
 *    don't get dominated by a giant 0% pile
 */

export interface AnalyticsKpis {
  totalSpend: number;
  activeCampaigns: number;
  totalCampaigns: number;
  avgCtr: number;
  ctrSampleSize: number;
  avgCpc: number;
  totalMsg: number;
  avgCostPerMsg: number;
}

export interface NamedValue {
  name: string;
  value: number;
}

export interface BucketDist {
  labels: string[];
  values: number[];
}

export interface CampaignWithCost {
  campaign: FbCampaign;
  cost: number;
}

export interface CampaignWithMetric {
  campaign: FbCampaign;
  metric: number;
}

export interface ScatterPoint {
  x: number;
  y: number;
  accountName: string;
  campaignName: string;
}

export interface AnalyticsData {
  kpis: AnalyticsKpis;
  spendByAccount: NamedValue[];
  msgByAccount: NamedValue[];
  ctrDist: BucketDist;
  msgCostDist: BucketDist;
  topMsg: CampaignWithMetric[];
  bestCpm: CampaignWithCost[];
  acctMsgCost: NamedValue[];
  acctCtr: NamedValue[];
  cpcDist: BucketDist;
  spendDist: BucketDist;
  msgRatio: { withMsg: number; withoutMsg: number };
  msgShare: NamedValue[];
  msgRoi: CampaignWithMetric[];
  scatter: ScatterPoint[];
  scatterIsMsgCost: boolean;
}

// ── KPIs ────────────────────────────────────────────────────

export function computeKpis(
  campaigns: FbCampaign[],
  accountInsights: Record<string, FbInsights | null>,
  visible: FbAccount[],
): AnalyticsKpis {
  const active = campaigns.filter((c) => c.status === "ACTIVE");

  // Prefer account-level insights spend (includes archived campaigns)
  // but fall back to per-campaign sum when that data is missing.
  const totalSpend = visible.reduce((sum, acc) => {
    const spend = accountInsights[acc.id]?.spend;
    if (spend) return sum + Number(spend);
    return (
      sum + campaigns.filter((c) => c._accountId === acc.id).reduce((s, c) => s + spendOf(c), 0)
    );
  }, 0);

  const ctrVals = campaigns
    .filter((c) => Number(getIns(c).ctr) > 0)
    .map((c) => Number(getIns(c).ctr));
  const cpcVals = campaigns
    .filter((c) => Number(getIns(c).cpc) > 0)
    .map((c) => Number(getIns(c).cpc));
  const avgCtr = ctrVals.length ? ctrVals.reduce((a, b) => a + b, 0) / ctrVals.length : 0;
  const avgCpc = cpcVals.length ? cpcVals.reduce((a, b) => a + b, 0) / cpcVals.length : 0;

  const totalMsg = campaigns.reduce((s, c) => s + getMsgCount(c), 0);
  const msgSpend = campaigns.filter((c) => getMsgCount(c) > 0).reduce((s, c) => s + spendOf(c), 0);
  const avgCostPerMsg = totalMsg > 0 ? msgSpend / totalMsg : 0;

  return {
    totalSpend,
    activeCampaigns: active.length,
    totalCampaigns: campaigns.length,
    avgCtr,
    ctrSampleSize: ctrVals.length,
    avgCpc,
    totalMsg,
    avgCostPerMsg,
  };
}

// ── Account-scoped aggregates ───────────────────────────────

const shortName = (s: string) => (s.length > 22 ? `${s.slice(0, 22)}…` : s);
const shortAcctName = (s: string) => (s.length > 16 ? `${s.slice(0, 16)}…` : s);

export function computeSpendByAccount(
  campaigns: FbCampaign[],
  insights: Record<string, FbInsights | null>,
  visible: FbAccount[],
): NamedValue[] {
  return visible
    .map((acc) => ({
      name: shortAcctName(acc.name),
      value: insights[acc.id]?.spend
        ? Number(insights[acc.id]?.spend)
        : campaigns.filter((c) => c._accountId === acc.id).reduce((s, c) => s + spendOf(c), 0),
    }))
    .filter((a) => a.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

export function computeMsgByAccount(campaigns: FbCampaign[], visible: FbAccount[]): NamedValue[] {
  return visible
    .map((acc) => ({
      name: shortAcctName(acc.name),
      value: campaigns
        .filter((c) => c._accountId === acc.id)
        .reduce((s, c) => s + getMsgCount(c), 0),
    }))
    .filter((a) => a.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

export function computeAcctMsgCost(campaigns: FbCampaign[], visible: FbAccount[]): NamedValue[] {
  const out: NamedValue[] = [];
  for (const acc of visible) {
    const cs = campaigns.filter(
      (c) => c._accountId === acc.id && getMsgCount(c) > 0 && spendOf(c) > 0,
    );
    if (cs.length === 0) continue;
    const totalSp = cs.reduce((s, c) => s + spendOf(c), 0);
    const totalM = cs.reduce((s, c) => s + getMsgCount(c), 0);
    if (totalM > 0) {
      out.push({ name: shortAcctName(acc.name), value: Math.round(totalSp / totalM) });
    }
  }
  return out.sort((a, b) => a.value - b.value);
}

export function computeAcctCtr(campaigns: FbCampaign[], visible: FbAccount[]): NamedValue[] {
  const out: NamedValue[] = [];
  for (const acc of visible) {
    const cs = campaigns.filter(
      (c) => c._accountId === acc.id && Number(getIns(c).impressions) > 0,
    );
    if (cs.length === 0) continue;
    const totalClicks = cs.reduce((s, c) => s + (Number(getIns(c).clicks) || 0), 0);
    const totalImpr = cs.reduce((s, c) => s + (Number(getIns(c).impressions) || 0), 0);
    const ctr = totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0;
    out.push({ name: shortAcctName(acc.name), value: Number(ctr.toFixed(2)) });
  }
  return out.sort((a, b) => b.value - a.value);
}

// ── Top N campaign lists ────────────────────────────────────

export function computeTopMsg(campaigns: FbCampaign[]): CampaignWithMetric[] {
  return [...campaigns]
    .filter((c) => getMsgCount(c) > 0 && spendOf(c) > 0)
    .sort((a, b) => getMsgCount(b) - getMsgCount(a))
    .slice(0, 10)
    .map((c) => ({ campaign: c, metric: getMsgCount(c) }));
}

export function computeBestCpm(campaigns: FbCampaign[]): CampaignWithCost[] {
  return campaigns
    .filter((c) => getMsgCount(c) > 0 && spendOf(c) > 0)
    .map((c) => ({ campaign: c, cost: spendOf(c) / getMsgCount(c) }))
    .sort((a, b) => a.cost - b.cost)
    .slice(0, 10);
}

export function computeMsgRoi(campaigns: FbCampaign[]): CampaignWithMetric[] {
  return campaigns
    .filter((c) => getMsgCount(c) > 0 && spendOf(c) > 0)
    .map((c) => ({ campaign: c, metric: getMsgCount(c) / (spendOf(c) / 1000) }))
    .sort((a, b) => b.metric - a.metric)
    .slice(0, 10);
}

// ── Distribution buckets ────────────────────────────────────

/**
 * Distribute values into labeled buckets using a pair-array so
 * TypeScript's noUncheckedIndexedAccess doesn't complain. Each entry
 * is `[label, predicate]`; the first predicate that returns true for
 * a value bumps that bucket's counter.
 */
function distribute<T>(
  items: T[],
  spec: Array<[label: string, test: (v: T) => boolean]>,
  filter?: (v: T) => boolean,
): BucketDist {
  const labels = spec.map(([l]) => l);
  const values = spec.map(() => 0);
  for (const item of items) {
    if (filter && !filter(item)) continue;
    for (let i = 0; i < spec.length; i++) {
      const entry = spec[i];
      if (!entry) continue;
      if (entry[1](item)) {
        values[i] = (values[i] ?? 0) + 1;
        break;
      }
    }
  }
  return { labels, values };
}

export function computeCtrDist(campaigns: FbCampaign[]): BucketDist {
  return distribute<FbCampaign>(
    campaigns,
    [
      ["0-1%", (c) => Number(getIns(c).ctr) < 1],
      ["1-2%", (c) => Number(getIns(c).ctr) < 2],
      ["2-3%", (c) => Number(getIns(c).ctr) < 3],
      ["3-5%", (c) => Number(getIns(c).ctr) < 5],
      [">5%", () => true],
    ],
    (c) => Number(getIns(c).ctr) > 0, // skip 0% — legacy behavior
  );
}

export function computeCpcDist(campaigns: FbCampaign[]): BucketDist {
  return distribute<FbCampaign>(
    campaigns,
    [
      ["$0-5", (c) => Number(getIns(c).cpc) < 5],
      ["$5-10", (c) => Number(getIns(c).cpc) < 10],
      ["$10-20", (c) => Number(getIns(c).cpc) < 20],
      ["$20-50", (c) => Number(getIns(c).cpc) < 50],
      [">$50", () => true],
    ],
    (c) => Number(getIns(c).cpc) > 0,
  );
}

export function computeSpendDist(campaigns: FbCampaign[]): BucketDist {
  return distribute<FbCampaign>(
    campaigns,
    [
      ["$0-1K", (c) => spendOf(c) < 1000],
      ["$1K-5K", (c) => spendOf(c) < 5000],
      ["$5K-10K", (c) => spendOf(c) < 10000],
      ["$10K-50K", (c) => spendOf(c) < 50000],
      [">$50K", () => true],
    ],
    (c) => spendOf(c) > 0,
  );
}

export function computeMsgCostDist(campaigns: FbCampaign[]): BucketDist {
  return distribute<FbCampaign>(
    campaigns,
    [
      ["$0-100", (c) => spendOf(c) / getMsgCount(c) < 100],
      ["$100-200", (c) => spendOf(c) / getMsgCount(c) < 200],
      ["$200-300", (c) => spendOf(c) / getMsgCount(c) < 300],
      ["$300-500", (c) => spendOf(c) / getMsgCount(c) < 500],
      [">$500", () => true],
    ],
    (c) => getMsgCount(c) > 0 && spendOf(c) > 0,
  );
}

// ── Ratio and share ─────────────────────────────────────────

export function computeMsgRatio(campaigns: FbCampaign[]) {
  const withSpend = campaigns.filter((c) => spendOf(c) > 0);
  const withMsg = withSpend.filter((c) => getMsgCount(c) > 0).length;
  return { withMsg, withoutMsg: withSpend.length - withMsg };
}

export function computeMsgShare(campaigns: FbCampaign[], visible: FbAccount[]): NamedValue[] {
  return visible
    .map((acc) => ({
      name: acc.name.replace(/（.*）/, "").replace(/ - 月結/, ""),
      value: campaigns
        .filter((c) => c._accountId === acc.id)
        .reduce((s, c) => s + getMsgCount(c), 0),
    }))
    .filter((a) => a.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

// ── Scatter plot ────────────────────────────────────────────

export function computeScatter(campaigns: FbCampaign[]): {
  data: ScatterPoint[];
  isMsgCost: boolean;
} {
  const hasMsgData = campaigns.some((c) => getMsgCount(c) > 0);
  if (hasMsgData) {
    return {
      data: campaigns
        .filter((c) => spendOf(c) > 0 && getMsgCount(c) > 0)
        .map((c) => ({
          x: spendOf(c),
          y: spendOf(c) / getMsgCount(c),
          accountName: c._accountName ?? "",
          campaignName: c.name,
        })),
      isMsgCost: true,
    };
  }
  return {
    data: campaigns
      .filter((c) => spendOf(c) > 0 && Number(getIns(c).ctr) > 0)
      .map((c) => ({
        x: Number(getIns(c).ctr),
        y: spendOf(c),
        accountName: c._accountName ?? "",
        campaignName: c.name,
      })),
    isMsgCost: false,
  };
}

// ── One-shot compute ────────────────────────────────────────

/**
 * Compute every analytics dataset in one pass. Call from the
 * view component wrapped in useMemo so it re-runs only when the
 * inputs actually change.
 */
export function computeAnalyticsData(
  campaigns: FbCampaign[],
  insights: Record<string, FbInsights | null>,
  visible: FbAccount[],
): AnalyticsData {
  const scatter = computeScatter(campaigns);
  return {
    kpis: computeKpis(campaigns, insights, visible),
    spendByAccount: computeSpendByAccount(campaigns, insights, visible),
    msgByAccount: computeMsgByAccount(campaigns, visible),
    ctrDist: computeCtrDist(campaigns),
    msgCostDist: computeMsgCostDist(campaigns),
    topMsg: computeTopMsg(campaigns),
    bestCpm: computeBestCpm(campaigns),
    acctMsgCost: computeAcctMsgCost(campaigns, visible),
    acctCtr: computeAcctCtr(campaigns, visible),
    cpcDist: computeCpcDist(campaigns),
    spendDist: computeSpendDist(campaigns),
    msgRatio: computeMsgRatio(campaigns),
    msgShare: computeMsgShare(campaigns, visible),
    msgRoi: computeMsgRoi(campaigns),
    scatter: scatter.data,
    scatterIsMsgCost: scatter.isMsgCost,
  };
}

/** Exposed for chart tooltip callbacks (short labels on bars). */
export const chartLabels = { shortName, shortAcctName };
