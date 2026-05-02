import { fM, fN } from "@/lib/format";
import type { OptimizationSummary } from "./optimizationData";

/**
 * Headline KPI strip at the top of the 成效優化中心 view.
 *
 * Four cards: total spend, total msgs, avg message cost, and a
 * "needs attention" count (critical + warning). The needs-attention
 * card is highlighted in orange so operators see at a glance how
 * many activities require action before they scroll the list.
 */
export function OptimizationSummaryStrip({ summary }: { summary: OptimizationSummary }) {
  const needsAttention = summary.criticalCount + summary.warningCount;
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3">
      <SummaryCard label="總花費" value={`$${fM(summary.totalSpend)}`} />
      <SummaryCard label="總私訊數" value={fN(summary.totalMsgs)} />
      <SummaryCard
        label="平均私訊成本"
        value={summary.totalMsgs > 0 ? `$${fM(summary.avgMsgCost)}` : "—"}
      />
      <SummaryCard label="需處理活動" value={fN(needsAttention)} highlight={needsAttention > 0} />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-xl border bg-white px-4 py-3 ${highlight ? "border-orange" : "border-border"}`}
    >
      <div className="text-[11px] font-medium uppercase tracking-[0.5px] text-gray-300">
        {label}
      </div>
      <div
        className={`text-[20px] font-bold tabular-nums md:text-[22px] ${highlight ? "text-orange" : "text-ink"}`}
      >
        {value}
      </div>
    </div>
  );
}
