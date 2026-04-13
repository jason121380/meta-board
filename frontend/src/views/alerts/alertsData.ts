import { getIns, getMsgCount } from "@/lib/insights";
import type { FbCampaign } from "@/types/fb";

/**
 * Pure alert rule evaluation. Ported from dashboard.html
 * `loadAiAlerts()` lines 2993–3101. Each rule produces zero or more
 * alert entries that eventually land in one of three cards:
 *
 *   msg  — 私訊成本過高  (P2 only, >$200)
 *   cpc  — CPC 過高       (P3 >$5, W3 $4-5)
 *   freq — 頻次過高       (P4 >5, W4 4-5 with spend > $500)
 *
 * The legacy code filters rule tags to populate each card, so we
 * return a flat list of entries per tag and the view slices them.
 */

export type AlertSeverity = "priority" | "warning";

export interface AlertEntry {
  campaign: FbCampaign;
  tag: string;
  severity: AlertSeverity;
  /** Computed metrics used for display + sort. */
  msgCost: number; // 0 if no msg data
  cpc: number;
  frequency: number;
  spend: number;
  msgs: number;
}

function baseCtx(c: FbCampaign): AlertEntry {
  const ins = getIns(c);
  const spend = Number(ins.spend) || 0;
  const msgs = getMsgCount(c);
  return {
    campaign: c,
    tag: "",
    severity: "priority",
    msgCost: msgs > 0 ? spend / msgs : 0,
    cpc: Number(ins.cpc) || 0,
    frequency: Number(ins.frequency) || 0,
    spend,
    msgs,
  };
}

/**
 * Evaluate all rules for a list of campaigns and return entries
 * grouped by the card they belong to (msg / cpc / freq).
 */
export interface AlertBuckets {
  msg: AlertEntry[];
  cpc: AlertEntry[];
  freq: AlertEntry[];
}

export function computeAlertBuckets(campaigns: FbCampaign[]): AlertBuckets {
  const msg: AlertEntry[] = [];
  const cpc: AlertEntry[] = [];
  const freq: AlertEntry[] = [];

  const hasMsgData = campaigns.some((c) => getMsgCount(c) > 0);

  // P2: msgCost > $200
  if (hasMsgData) {
    const p2 = campaigns
      .filter((c) => {
        const ins = getIns(c);
        return getMsgCount(c) > 0 && Number(ins.spend) / getMsgCount(c) > 200;
      })
      .map((c) => ({ ...baseCtx(c), tag: "私訊成本過高", severity: "priority" as const }));
    msg.push(...p2);
  }

  // P3: CPC > $5 (ACTIVE only)
  const p3 = campaigns
    .filter((c) => c.status === "ACTIVE" && Number(getIns(c).cpc) > 5)
    .map((c) => ({ ...baseCtx(c), tag: "CPC 過高", severity: "priority" as const }));
  cpc.push(...p3);

  // W3: CPC $4-5
  const w3 = campaigns
    .filter((c) => {
      const cpcVal = Number(getIns(c).cpc);
      return c.status === "ACTIVE" && cpcVal > 4 && cpcVal <= 5;
    })
    .map((c) => ({ ...baseCtx(c), tag: "CPC 偏高", severity: "warning" as const }));
  cpc.push(...w3);

  // P4: frequency > 5 with spend > $1000
  const p4 = campaigns
    .filter((c) => {
      const ins = getIns(c);
      return c.status === "ACTIVE" && Number(ins.frequency) > 5 && Number(ins.spend) > 1000;
    })
    .map((c) => ({ ...baseCtx(c), tag: "頻次過高", severity: "priority" as const }));
  freq.push(...p4);

  // W4: frequency > 4 ≤ 5 with spend > $500
  const w4 = campaigns
    .filter((c) => {
      const ins = getIns(c);
      const f = Number(ins.frequency);
      return c.status === "ACTIVE" && f > 4 && f <= 5 && Number(ins.spend) > 500;
    })
    .map((c) => ({ ...baseCtx(c), tag: "頻次偏高", severity: "warning" as const }));
  freq.push(...w4);

  return { msg, cpc, freq };
}

// ── Sorting and filtering ───────────────────────────────────

export type AlertCardKey = "msg" | "cpc" | "freq";

export interface AlertSortState {
  /** The column key being sorted on ('campaign' / 'msgCost' / 'cpc' / 'frequency'). */
  key: string;
  /** 1 = asc, -1 = desc. */
  dir: 1 | -1;
}

export function sortAlertEntries(entries: AlertEntry[], sort: AlertSortState): AlertEntry[] {
  const { key, dir } = sort;
  return [...entries].sort((a, b) => {
    let va: number | string;
    let vb: number | string;
    switch (key) {
      case "campaign":
        va = a.campaign.name;
        vb = b.campaign.name;
        break;
      case "msgCost":
        va = a.msgCost;
        vb = b.msgCost;
        break;
      case "cpc":
        va = a.cpc;
        vb = b.cpc;
        break;
      case "frequency":
        va = a.frequency;
        vb = b.frequency;
        break;
      default:
        return 0;
    }
    if (typeof va === "string" && typeof vb === "string") {
      return va.localeCompare(vb) * dir;
    }
    const na = va as number;
    const nb = vb as number;
    if (na === nb) return 0;
    return na > nb ? dir : -dir;
  });
}

/**
 * Apply the card-specific keyword filter:
 *   msg  — include only campaigns whose name contains "私訊" AND NOT "接"
 *          (legacy-specific: avoid "接洽" type campaign names)
 *   cpc  — exclude campaigns whose name contains "私訊"
 *   freq — no filter
 */
export function filterAlertEntries(
  entries: AlertEntry[],
  card: AlertCardKey,
  filterActive: boolean,
): AlertEntry[] {
  if (!filterActive) return entries;
  if (card === "msg") {
    return entries.filter(
      (e) => e.campaign.name.includes("私訊") && !e.campaign.name.includes("接"),
    );
  }
  if (card === "cpc") {
    return entries.filter((e) => !e.campaign.name.includes("私訊"));
  }
  return entries;
}

/**
 * Build a Facebook Ads Manager link for a campaign. Optional
 * business_id is appended when available (required to deep-link
 * into the right workspace).
 */
export function fbCampaignLink(entry: AlertEntry, businessId?: string): string {
  const act = (entry.campaign._accountId ?? "").replace("act_", "");
  if (!act) return "";
  const bizParam = businessId ? `&business_id=${businessId}` : "";
  return `https://adsmanager.facebook.com/adsmanager/manage/campaigns/edit/standalone?act=${act}${bizParam}&selected_campaign_ids=${entry.campaign.id}&current_step=0`;
}
