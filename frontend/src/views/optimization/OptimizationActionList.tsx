import { OptimizationRow } from "./OptimizationRow";
import type { OptimizationItem, OptimizationSeverity } from "./optimizationData";

/**
 * Two-column action board — only critical (需立即處理) and warning
 * (建議觀察) columns are rendered. The "good" tier is intentionally
 * hidden: this view exists to surface what needs the operator's
 * attention; healthy campaigns are noise here. Counts for all three
 * tiers still appear on OptimizationSummaryStrip for context.
 */

interface ColumnConfig {
  key: OptimizationSeverity;
  title: string;
  dotColor: string;
}

const COLUMNS: ColumnConfig[] = [
  { key: "critical", title: "需立即處理", dotColor: "bg-orange" },
  { key: "warning", title: "建議觀察", dotColor: "bg-amber-400" },
];

export function OptimizationActionList({
  items,
  businessIdForCampaign,
}: {
  items: OptimizationItem[];
  businessIdForCampaign: (accountId: string | undefined) => string | undefined;
}) {
  // Bucket once; the items array is already priority-sorted within
  // each severity from buildOptimizationItems(). We keep all three
  // tiers in the bucket map for type completeness, but only the
  // critical/warning slots are rendered.
  const buckets: Record<OptimizationSeverity, OptimizationItem[]> = {
    critical: [],
    warning: [],
    good: [],
  };
  for (const it of items) buckets[it.severity].push(it);

  return (
    <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 md:gap-3.5">
      {COLUMNS.map((col) => (
        <div key={col.key} className="flex min-w-0 flex-col gap-2">
          {/* Column header — no surrounding box, just a colored dot
              + title + count to delimit the column without adding
              another border layer around the campaign cards. */}
          <div className="flex items-center gap-1.5 px-0.5 pb-0.5 text-[12px] font-semibold text-ink">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${col.dotColor}`} />
            <span>{col.title}</span>
            <span className="ml-auto text-[11px] font-medium text-gray-300 tabular-nums">
              {buckets[col.key].length}
            </span>
          </div>

          {/* Cards */}
          {buckets[col.key].length === 0 ? (
            <div className="px-1 py-3 text-center text-[11px] text-gray-300">無項目</div>
          ) : (
            buckets[col.key].map((item) => (
              <OptimizationRow
                key={item.campaign.id}
                item={item}
                businessIdForCampaign={businessIdForCampaign}
              />
            ))
          )}
        </div>
      ))}
    </div>
  );
}
