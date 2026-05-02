import { getIns, getMsgCount } from "@/lib/insights";
import { buildCampaignRecommendations } from "@/lib/recommendations";
import type { FbCampaign } from "@/types/fb";

/**
 * Pure data layer for the 成效優化中心 view.
 *
 * Aggregates "currently running" campaigns across every visible
 * account, scores each one by urgency, and attaches the same
 * recommendation bullets that drive the LINE flex push and the
 * public share-page report (`buildCampaignRecommendations`).
 *
 * "Currently running" definition (per product):
 *   - status === ACTIVE  → always included
 *   - status === PAUSED  → included only when spend > 0 in the
 *     selected date range (i.e. it was paused mid-flight after
 *     already accumulating spend — operators want to revisit those
 *     decisions).
 */

export type OptimizationSeverity = "critical" | "warning" | "good";

export interface OptimizationMetrics {
  spend: number;
  msgs: number;
  msgCost: number;
  cpc: number;
  frequency: number;
  ctr: number;
  impressions: number;
}

export interface OptimizationItem {
  campaign: FbCampaign;
  severity: OptimizationSeverity;
  /** Numeric urgency score — higher = sort earlier within a severity tier. */
  priority: number;
  recommendations: string[];
  metrics: OptimizationMetrics;
}

function readMetrics(c: FbCampaign): OptimizationMetrics {
  const ins = getIns(c);
  const spend = Number(ins.spend) || 0;
  const msgs = getMsgCount(c);
  return {
    spend,
    msgs,
    msgCost: msgs > 0 ? spend / msgs : 0,
    cpc: Number(ins.cpc) || 0,
    frequency: Number(ins.frequency) || 0,
    ctr: Number(ins.ctr) || 0,
    impressions: Number(ins.impressions) || 0,
  };
}

/**
 * Score a campaign's urgency. The thresholds here mirror the rules
 * used by `buildCampaignRecommendations`, but collapsed into a
 * single numeric priority so we can sort the flat list.
 *
 *   critical (>= 1000) — needs action now
 *   warning  (500-999) — watch closely
 *   good     (< 500)   — performing as expected
 */
function scorePriority(m: OptimizationMetrics): {
  severity: OptimizationSeverity;
  priority: number;
} {
  // CRITICAL — message cost blowing out
  if (m.msgs > 0 && m.msgCost > 300) {
    return { severity: "critical", priority: 1000 + m.msgCost };
  }
  // CRITICAL — no messages and CPC very high
  if (m.msgs === 0 && m.cpc > 6) {
    return { severity: "critical", priority: 1000 + m.cpc * 100 };
  }
  // CRITICAL — frequency burning through audience
  if (m.frequency > 5 && m.spend > 1000) {
    return { severity: "critical", priority: 1000 + m.frequency * 100 };
  }

  // WARNING — message cost trending up
  if (m.msgs > 0 && m.msgCost > 200 && m.msgCost <= 300) {
    return { severity: "warning", priority: 500 + m.msgCost };
  }
  // WARNING — CPC in the watch band
  if (m.msgs === 0 && m.cpc > 4 && m.cpc <= 6) {
    return { severity: "warning", priority: 500 + m.cpc * 50 };
  }
  // WARNING — frequency creeping up
  if (m.frequency > 4 && m.frequency <= 5 && m.spend > 500) {
    return { severity: "warning", priority: 500 + m.frequency * 50 };
  }

  // GOOD — no rule fired. Use spend as tiebreaker so the biggest
  // healthy spenders still float to the top of their tier.
  return { severity: "good", priority: Math.max(0, Math.min(499, m.spend / 100)) };
}

/**
 * Filter to "currently running" campaigns and return them as
 * priority-scored items, sorted by severity → priority desc → spend desc.
 */
export function buildOptimizationItems(campaigns: FbCampaign[]): OptimizationItem[] {
  const items: OptimizationItem[] = [];
  for (const c of campaigns) {
    const isActive = c.status === "ACTIVE";
    const m = readMetrics(c);
    const isPausedWithSpend = c.status === "PAUSED" && m.spend > 0;
    if (!isActive && !isPausedWithSpend) continue;

    const { severity, priority } = scorePriority(m);
    items.push({
      campaign: c,
      severity,
      priority,
      recommendations: buildCampaignRecommendations({
        spend: m.spend,
        msgs: m.msgs,
        msgCost: m.msgCost,
        cpc: m.cpc,
        frequency: m.frequency,
        objective: c.objective ?? null,
      }),
      metrics: m,
    });
  }

  const SEVERITY_RANK: Record<OptimizationSeverity, number> = {
    critical: 0,
    warning: 1,
    good: 2,
  };
  items.sort((a, b) => {
    const sa = SEVERITY_RANK[a.severity];
    const sb = SEVERITY_RANK[b.severity];
    if (sa !== sb) return sa - sb;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return b.metrics.spend - a.metrics.spend;
  });

  return items;
}

export interface OptimizationSummary {
  totalSpend: number;
  totalMsgs: number;
  avgMsgCost: number;
  criticalCount: number;
  warningCount: number;
  goodCount: number;
}

export function summarizeOptimization(items: OptimizationItem[]): OptimizationSummary {
  let totalSpend = 0;
  let totalMsgs = 0;
  let critical = 0;
  let warning = 0;
  let good = 0;

  for (const it of items) {
    totalSpend += it.metrics.spend;
    totalMsgs += it.metrics.msgs;
    if (it.severity === "critical") critical++;
    else if (it.severity === "warning") warning++;
    else good++;
  }

  return {
    totalSpend,
    totalMsgs,
    avgMsgCost: totalMsgs > 0 ? totalSpend / totalMsgs : 0,
    criticalCount: critical,
    warningCount: warning,
    goodCount: good,
  };
}
