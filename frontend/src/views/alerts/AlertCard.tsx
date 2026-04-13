import { cn } from "@/lib/cn";
import { fF, fM } from "@/lib/format";
import { useMemo, useState } from "react";
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
    <div
      className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white"
      style={{ borderTop: "2px solid var(--orange)" }}
    >
      <div
        className="flex items-center gap-2 border-b-2 border-orange px-3.5 py-2.5"
        style={{ background: "var(--orange-bg)" }}
      >
        <div>
          <div className="text-[13px] font-bold text-orange">{title}</div>
          <div className="mt-0.5 text-[10px] font-medium text-orange opacity-70">{description}</div>
        </div>
        {filterLabel && (
          <label className="ml-auto flex cursor-pointer items-center gap-1 text-[11px] font-normal text-orange opacity-85">
            {filterLabel}
            <input
              type="checkbox"
              className="custom-cb"
              checked={filterOn}
              onChange={(e) => setFilterOn(e.currentTarget.checked)}
              style={{ width: 13, height: 13 }}
            />
          </label>
        )}
      </div>
      <div className="flex-1 overflow-x-auto">
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
              rows.map((entry) => {
                const link = fbCampaignLink(
                  entry,
                  businessIdForCampaign(entry.campaign._accountId),
                );
                return (
                  <tr key={entry.campaign.id} className="border-b border-border">
                    <td className="max-w-[220px] px-2.5 py-2 text-left text-xs">
                      <div className="flex items-center">
                        <span className="flex-1 truncate font-semibold" title={entry.campaign.name}>
                          {entry.campaign.name}
                        </span>
                        {link && (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1.5 shrink-0 text-[11px] text-gray-300 no-underline"
                            title="開啟臉書後台"
                          >
                            ↗
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-right text-xs">
                      {metric.render(entry)}
                    </td>
                  </tr>
                );
              })
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
        "cursor-pointer select-none whitespace-nowrap px-2.5 py-2 text-[11px] font-bold",
        right ? "text-right" : "text-left",
        active ? "text-orange" : "text-gray-500",
      )}
    >
      {label}
      {arrow}
    </th>
  );
}
