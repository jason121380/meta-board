import { Badge } from "@/components/Badge";
import { fbCampaignLink } from "@/lib/fbLinks";
import { fF, fM, fN, fP } from "@/lib/format";
import { memo } from "react";
import type { OptimizationItem, OptimizationSeverity } from "./optimizationData";

/**
 * A single campaign row in the 成效優化中心 action list.
 *
 * Shows: severity dot, status badge, account name, campaign name
 * (with FB Ads Manager deep link), KPI strip, and the bullet list
 * of recommendations from `buildCampaignRecommendations`.
 */

const SEVERITY_DOT: Record<OptimizationSeverity, string> = {
  critical: "bg-orange",
  warning: "bg-amber-400",
  good: "bg-emerald-500",
};

const SEVERITY_LABEL: Record<OptimizationSeverity, string> = {
  critical: "需立即處理",
  warning: "建議觀察",
  good: "表現良好",
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
      className={`flex flex-col gap-2.5 rounded-xl border bg-white px-4 py-3 md:px-5 md:py-3.5 ${severity === "critical" ? "border-orange" : "border-border"}`}
    >
      {/* Header row: severity dot + status badge + account name */}
      <div className="flex items-center gap-2 text-[12px] text-gray-500">
        <span
          aria-hidden="true"
          className={`h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[severity]}`}
        />
        <span className="shrink-0 font-semibold text-ink">{SEVERITY_LABEL[severity]}</span>
        <span className="shrink-0 text-gray-300">·</span>
        <Badge status={campaign.status} />
        {campaign._accountName && (
          <>
            <span className="shrink-0 text-gray-300">·</span>
            <span className="truncate" title={campaign._accountName}>
              {campaign._accountName}
            </span>
          </>
        )}
      </div>

      {/* Campaign name + FB deep-link icon */}
      <div className="flex items-start gap-2">
        <div className="flex-1 truncate text-[14px] font-semibold text-ink md:text-[15px]">
          {campaign.name}
        </div>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-300 hover:bg-orange-bg hover:text-orange"
            title="在 Facebook 廣告管理員開啟"
            aria-label={`在 Facebook 廣告管理員開啟 ${campaign.name}`}
          >
            <svg
              width="14"
              height="14"
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

      {/* KPI strip */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] tabular-nums text-gray-500 md:text-[13px]">
        <Metric label="花費" value={`$${fM(metrics.spend)}`} />
        <Metric label="私訊" value={fN(metrics.msgs)} />
        {metrics.msgs > 0 && (
          <Metric
            label="私訊成本"
            value={`$${fM(metrics.msgCost)}`}
            emphasized={metrics.msgCost > 200}
          />
        )}
        <Metric label="CPC" value={`$${fM(metrics.cpc)}`} emphasized={metrics.cpc > 4} />
        <Metric label="CTR" value={fP(metrics.ctr)} />
        <Metric label="頻次" value={fF(metrics.frequency)} emphasized={metrics.frequency > 4} />
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <ul className="m-0 mt-0.5 flex list-none flex-col gap-1 p-0 text-[13px] leading-relaxed text-ink">
          {recommendations.map((rec) => (
            <li key={rec} className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-[3px] text-orange">
                ▸
              </span>
              <span className="flex-1">{rec}</span>
            </li>
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
