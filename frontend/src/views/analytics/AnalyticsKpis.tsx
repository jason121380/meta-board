import { fM } from "@/lib/format";
import type { AnalyticsKpis } from "./analyticsData";

/**
 * Six-card KPI strip at the top of the Analytics view. Uses the
 * legacy `.ai-kpi-card` CSS classes from globals.css.
 *
 * Port of the original design lines 2538–2543.
 */

export interface AnalyticsKpisProps {
  kpis: AnalyticsKpis;
  accountCount: number;
  periodLabel: string;
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="ai-kpi-card">
      <div className="ai-kpi-label">{label}</div>
      <div className="ai-kpi-value">{value}</div>
      <div className="ai-kpi-sub">{sub}</div>
    </div>
  );
}

export function AnalyticsKpisRow({ kpis, accountCount, periodLabel }: AnalyticsKpisProps) {
  return (
    <div
      className="mb-3 grid gap-2 md:mb-5 md:gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}
    >
      <KpiCard
        label="總花費"
        value={`$${fM(kpis.totalSpend)}`}
        sub={`${accountCount} 個帳戶・${periodLabel}`}
      />
      <KpiCard
        label="進行中活動"
        value={String(kpis.activeCampaigns)}
        sub={`共 ${kpis.totalCampaigns} 個`}
      />
      <KpiCard
        label="平均 CTR"
        value={`${kpis.avgCtr.toFixed(2)}%`}
        sub={`有數據活動 ${kpis.ctrSampleSize} 個`}
      />
      <KpiCard label="平均 CPC" value={`$${fM(kpis.avgCpc)}`} sub="TWD" />
      <KpiCard label="總私訊數" value={fM(kpis.totalMsg)} sub="私訊對話" />
      <KpiCard
        label="私訊成本"
        value={kpis.totalMsg > 0 ? `$${fM(kpis.avgCostPerMsg)}` : "—"}
        sub="每則私訊"
      />
    </div>
  );
}
