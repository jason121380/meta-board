import { Badge } from "@/components/Badge";
import { fbCampaignLink } from "@/lib/fbLinks";
import { fF, fM, fN, fP } from "@/lib/format";
import { memo } from "react";
import type { OptimizationItem, OptimizationSeverity } from "./optimizationData";

/**
 * Compact campaign row for the 3-column 成效優化中心 layout.
 *
 * Three columns of these stack vertically per severity, so each
 * card is dense: tight padding, single-row header, two-row KPI grid,
 * recommendations rendered as inline-wrapped tight bullets.
 */

const BORDER_BY_SEVERITY: Record<OptimizationSeverity, string> = {
  critical: "border-orange",
  warning: "border-amber-300",
  good: "border-border",
};

export interface OptimizationRowProps {
  item: OptimizationItem;
  businessIdForCampaign: (accountId: string | undefined) => string | undefined;
}

export const OptimizationRow = memo(function OptimizationRow({
  item,
  businessIdForCampaign,
}: OptimizationRowProps) {
  const { campaign, severity, metrics, recommendations } = item;
  const link = fbCampaignLink(
    campaign.id,
    campaign._accountId,
    businessIdForCampaign(campaign._accountId),
  );

  return (
    <div
      className={`flex flex-col gap-1.5 rounded-lg border bg-white px-3 py-2.5 ${BORDER_BY_SEVERITY[severity]}`}
    >
      {/* Header row: status badge + account name */}
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
        <Badge status={campaign.status} />
        {campaign._accountName && (
          <span className="truncate" title={campaign._accountName}>
            {campaign._accountName}
          </span>
        )}
      </div>

      {/* Campaign name + FB deep-link icon */}
      <div className="flex items-start gap-1.5">
        <div
          className="flex-1 text-[12.5px] font-semibold leading-snug text-ink"
          title={campaign.name}
        >
          {campaign.name}
        </div>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-300 hover:bg-orange-bg hover:text-orange"
            title="在 Facebook 廣告管理員開啟"
            aria-label={`在 Facebook 廣告管理員開啟 ${campaign.name}`}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            <span className="sr-only">在 Facebook 廣告管理員開啟</span>
          </a>
        )}
      </div>

      {/* KPI strip — wraps inline; tabular-nums keeps values aligned */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-gray-500">
        <Metric label="花費" value={`$${fM(metrics.spend)}`} />
        {metrics.msgs > 0 && <Metric label="私訊" value={fN(metrics.msgs)} />}
        {metrics.msgs > 0 && (
          <Metric
            label="成本"
            value={`$${fM(metrics.msgCost)}`}
            emphasized={metrics.msgCost > 200}
          />
        )}
        <Metric label="CPC" value={`$${fM(metrics.cpc)}`} emphasized={metrics.cpc > 4} />
        <Metric label="CTR" value={fP(metrics.ctr)} />
        <Metric label="頻次" value={fF(metrics.frequency)} emphasized={metrics.frequency > 4} />
      </div>

      {/* Recommendations — compact, no bullet symbol overhead */}
      {recommendations.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-[11.5px] leading-snug text-ink/80">
          {recommendations.map((rec) => (
            <li key={rec}>{rec}</li>
          ))}
        </ul>
      )}
    </div>
  );
});

function Metric({
  label,
  value,
  emphasized,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-gray-300">{label}</span>
      <span className={emphasized ? "font-semibold text-orange" : "text-ink"}>{value}</span>
    </span>
  );
}
