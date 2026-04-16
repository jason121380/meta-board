import { cn } from "@/lib/cn";
import { fF, fM } from "@/lib/format";
import { memo, useMemo, useState } from "react";
import {
  type AlertCardKey,
  type AlertEntry,
  type AlertSortState,
  fbCampaignLink,
  filterAlertEntries,
  sortAlertEntries,
} from "./alertsData";

/**
 * Single alert card — title header, optional keyword filter, one
 * sortable metric column, and a list of rows. Three copies are
 * rendered side-by-side on the Alerts view.
 *
 * Ported from dashboard.html cardShell() + _renderAlertCardHead +
 * _renderAlertCardRows (lines 3120–3144).
 */

export interface AlertCardProps {
  cardKey: AlertCardKey;
  title: string;
  description: string;
  /** Alert entries to display. */
  entries: AlertEntry[];
  /** Filter checkbox label (null = no filter). */
  filterLabel: string | null;
  /** Optional business id for the FB ads manager deep link. */
  businessIdForCampaign: (accountId: string | undefined) => string | undefined;
}

// Per-card metric column config: how to read, render, label it.
const METRIC_BY_KEY = {
  msg: {
    label: "私訊成本",
    sortKey: "msgCost",
    read: (e: AlertEntry) => e.msgCost,
    render: (e: AlertEntry) =>
      e.msgCost > 0 ? (
        <span className={cn(e.msgCost > 300 ? "font-bold text-orange" : "")}>${fM(e.msgCost)}</span>
      ) : (
        "—"
      ),
  },
  cpc: {
    label: "CPC",
    sortKey: "cpc",
    read: (e: AlertEntry) => e.cpc,
    render: (e: AlertEntry) =>
      e.cpc > 0 ? (
        <span className={cn(e.cpc > 6 ? "font-bold text-orange" : "")}>${fM(e.cpc)}</span>
      ) : (
        "—"
      ),
  },
  freq: {
    label: "頻次",
    sortKey: "frequency",
    read: (e: AlertEntry) => e.frequency,
    render: (e: AlertEntry) =>
      e.frequency > 0 ? (
        <span className={cn(e.frequency > 5 ? "font-bold text-orange" : "")}>
          {fF(e.frequency)}
        </span>
      ) : (
        "—"
      ),
  },
} as const;

export function AlertCard({
  cardKey,
  title,
  description,
  entries,
  filterLabel,
  businessIdForCampaign,
}: AlertCardProps) {
  const metric = METRIC_BY_KEY[cardKey];
  const [filterOn, setFilterOn] = useState(filterLabel !== null);
  const [sort, setSort] = useState<AlertSortState>({ key: metric.sortKey, dir: -1 });

  const rows = useMemo(() => {
    const filtered = filterAlertEntries(entries, cardKey, filterOn);
    return sortAlertEntries(filtered, sort);
  }, [entries, cardKey, filterOn, sort]);

  const toggleSort = (key: string) => {
    setSort((prev) => ({
      key,
      dir: prev.key === key ? (prev.dir === -1 ? 1 : -1) : -1,
    }));
  };

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-white">
      <div
        className="flex items-center gap-2 border-b border-border px-4 py-3"
        style={{ background: "var(--orange-bg)" }}
      >
        <div className="min-w-0">
          <div className="text-[14px] font-bold text-orange md:text-[13px]">{title}</div>
          <div className="mt-0.5 text-[11px] font-medium text-orange opacity-70 md:text-[10px]">
            {description}
          </div>
        </div>
        {filterLabel && (
          <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] font-normal text-orange opacity-85">
            {filterLabel}
            <input
              type="checkbox"
              className="custom-cb"
              checked={filterOn}
              onChange={(e) => setFilterOn(e.currentTarget.checked)}
            />
          </label>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border bg-bg">
              <SortHeader label="行銷活動" sortKey="campaign" sort={sort} onToggle={toggleSort} />
              <SortHeader
                label={metric.label}
                sortKey={metric.sortKey}
                sort={sort}
                onToggle={toggleSort}
                right
              />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-2.5 py-5 text-center text-xs text-gray-300">
                  無異常項目
                </td>
              </tr>
            ) : (
              rows.map((entry) => (
                <AlertCardRow
                  key={entry.campaign.id}
                  entry={entry}
                  metric={metric}
                  businessId={businessIdForCampaign(entry.campaign._accountId)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onToggle,
  right,
}: {
  label: string;
  sortKey: string;
  sort: AlertSortState;
  onToggle: (key: string) => void;
  right?: boolean;
}) {
  const active = sort.key === sortKey;
  const arrow = active ? (sort.dir === -1 ? " ▼" : " ▲") : "";
  return (
    <th
      onClick={() => onToggle(sortKey)}
      className={cn(
        "sticky top-0 z-[1] cursor-pointer select-none whitespace-nowrap px-2.5 py-2 text-[11px] font-bold",
        right ? "text-right" : "text-left",
        active ? "text-orange" : "text-gray-500",
      )}
    >
      {label}
      {arrow}
    </th>
  );
}

type MetricConfig = (typeof METRIC_BY_KEY)[keyof typeof METRIC_BY_KEY];

const AlertCardRow = memo(function AlertCardRow({
  entry,
  metric,
  businessId,
}: {
  entry: AlertEntry;
  metric: MetricConfig;
  businessId: string | undefined;
}) {
  const link = fbCampaignLink(entry, businessId);
  return (
    <tr className="border-b border-border">
      <td className="max-w-[220px] px-3 py-3 text-left text-[13px] md:px-2.5 md:py-2 md:text-xs">
        <div className="flex items-center">
          <span className="flex-1 truncate font-semibold" title={entry.campaign.name}>
            {entry.campaign.name}
          </span>
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="ml-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-300 no-underline hover:bg-orange-bg hover:text-orange active:bg-orange-bg active:text-orange md:ml-1.5"
              title="在 Facebook 廣告管理員開啟"
              aria-label={`在 Facebook 廣告管理員開啟 ${entry.campaign.name}`}
            >
              <svg
                width="13"
                height="13"
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
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-right text-[13px] md:px-2.5 md:py-2 md:text-xs">
        {metric.render(entry)}
      </td>
    </tr>
  );
});
