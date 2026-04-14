import { fF, fM, fN, fP } from "@/lib/format";
import type { FbAccount, FbInsights } from "@/types/fb";
import { useMemo } from "react";

/**
 * Twelve-stat KPI grid rendered above the tree table.
 *
 * Pulls from the per-account insights map produced by
 * `useMultiAccountInsights`. Averages for CTR / CPC / CPM / frequency
 * are computed across accounts that HAVE the field (legacy behavior
 * — we don't down-weight for accounts where the field is missing).
 *
 * Ported from dashboard.html `loadOverviewStats()` (line 1837).
 */

export interface StatsGridProps {
  accounts: FbAccount[];
  insights: Record<string, FbInsights | null>;
  isLoading: boolean;
}

interface Totals {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  purchase: number;
  lead: number;
  msg: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  frequency: number | null;
}

const MSG_TYPES = [
  "onsite_conversion.messaging_conversation_started_7d",
  "messaging_conversation_started_7d",
] as const;

function computeTotals(accounts: FbAccount[], insights: Record<string, FbInsights | null>): Totals {
  const totals: Totals = {
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    purchase: 0,
    lead: 0,
    msg: 0,
    ctr: null,
    cpc: null,
    cpm: null,
    frequency: null,
  };
  const ctrVals: number[] = [];
  const cpcVals: number[] = [];
  const cpmVals: number[] = [];
  const freqVals: number[] = [];

  for (const acc of accounts) {
    const i = insights[acc.id];
    if (!i) continue;
    totals.spend += Number(i.spend) || 0;
    totals.impressions += Number(i.impressions) || 0;
    totals.reach += Number(i.reach) || 0;
    totals.clicks += Number(i.clicks) || 0;
    if (i.ctr) ctrVals.push(Number(i.ctr));
    if (i.cpc) cpcVals.push(Number(i.cpc));
    if (i.cpm) cpmVals.push(Number(i.cpm));
    if (i.frequency) freqVals.push(Number(i.frequency));
    for (const action of i.actions ?? []) {
      if (action.action_type === "purchase") totals.purchase += Number(action.value) || 0;
      else if (action.action_type === "lead") totals.lead += Number(action.value) || 0;
      else if ((MSG_TYPES as readonly string[]).includes(action.action_type)) {
        // First-found wins for messaging — don't double-count; we
        // break out of the loop when we hit the first match.
        totals.msg += Number(action.value) || 0;
        break;
      }
    }
  }

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  totals.ctr = avg(ctrVals);
  totals.cpc = avg(cpcVals);
  totals.cpm = avg(cpmVals);
  totals.frequency = avg(freqVals);
  return totals;
}

const SHIMMER_STYLE: React.CSSProperties = {
  display: "inline-block",
  width: 50,
  height: 14,
  borderRadius: 3,
  background: "linear-gradient(90deg, var(--border) 25%, var(--warm-white) 50%, var(--border) 75%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.2s infinite",
};

interface StatProps {
  label: string;
  value: string;
  loading?: boolean;
}

function Stat({ label, value, loading }: StatProps) {
  return (
    <div className="rounded-lg border border-border bg-white px-2.5 py-1.5 md:px-3 md:py-2">
      <div className="text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-300 md:text-[10px]">
        {label}
      </div>
      <div className="mt-0.5 flex min-h-[18px] items-center text-[14px] font-bold leading-none tracking-[-0.3px] text-ink tabular-nums md:text-[16px]">
        {loading ? <span style={SHIMMER_STYLE} /> : value}
      </div>
    </div>
  );
}

export function StatsGrid({ accounts, insights, isLoading }: StatsGridProps) {
  const totals = useMemo(() => computeTotals(accounts, insights), [accounts, insights]);
  const cpmMsg = totals.msg > 0 ? totals.spend / totals.msg : null;
  const empty = accounts.length === 0;

  // Compact strip: ≤768 → 4 cols × 3 rows, ≥768 → auto-fit so all
  // 12 KPIs typically land on a single row on a 1280+ desktop.
  // The min size of 92px is small enough that 12 cards fit in
  // 1280 - 220 sidebar = 1060px (12 × 88 = 1056), leaving the table
  // below 80%+ of the vertical space.
  return (
    <div className="grid shrink-0 grid-cols-4 gap-1.5 bg-bg p-2 pb-0 md:grid-cols-[repeat(auto-fit,minmax(92px,1fr))] md:gap-2 md:p-3 md:pb-0">
      <Stat label="花費" value={empty ? "—" : fM(totals.spend)} loading={isLoading && !empty} />
      <Stat
        label="曝光"
        value={empty ? "—" : fN(totals.impressions)}
        loading={isLoading && !empty}
      />
      <Stat label="觸及" value={empty ? "—" : fN(totals.reach)} loading={isLoading && !empty} />
      <Stat label="點擊" value={empty ? "—" : fN(totals.clicks)} loading={isLoading && !empty} />
      <Stat label="CTR" value={empty ? "—" : fP(totals.ctr)} loading={isLoading && !empty} />
      <Stat label="CPC" value={empty ? "—" : fM(totals.cpc)} loading={isLoading && !empty} />
      <Stat label="CPM" value={empty ? "—" : fM(totals.cpm)} loading={isLoading && !empty} />
      <Stat label="頻率" value={empty ? "—" : fF(totals.frequency)} loading={isLoading && !empty} />
      <Stat
        label="購買數"
        value={empty ? "—" : fN(totals.purchase)}
        loading={isLoading && !empty}
      />
      <Stat label="名單數" value={empty ? "—" : fN(totals.lead)} loading={isLoading && !empty} />
      <Stat label="私訊數" value={empty ? "—" : fN(totals.msg)} loading={isLoading && !empty} />
      <Stat
        label="私訊成本"
        value={empty || cpmMsg === null ? "—" : fM(cpmMsg)}
        loading={isLoading && !empty}
      />
    </div>
  );
}
