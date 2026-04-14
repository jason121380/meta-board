import { Skeleton } from "@/components/Skeleton";
import { cn } from "@/lib/cn";
import { fbAdLink } from "@/lib/fbLinks";
import { fM, fN, fP } from "@/lib/format";
import { getIns, getMsgCount } from "@/lib/insights";
import type { FbAccount, FbCreativeEntity } from "@/types/fb";
import { useMemo } from "react";

/**
 * Sortable flat table of every 3rd-level ad across enabled accounts.
 * Mirrors the Dashboard tree's row height (30px body, driven by the
 * thumbnail) and the Finance table's sort-header pattern.
 *
 * Clicking a row calls `onRowClick(creative)`; the parent view opens
 * the shared CreativePreviewModal. The FB deep-link icon is scoped
 * to the 行銷活動 cell and stops propagation so it doesn't trigger
 * the preview modal.
 */

export type CreativeSortKey =
  | "account"
  | "campaign"
  | "name"
  | "spend"
  | "clicks"
  | "ctr"
  | "cpc"
  | "msgs"
  | "msgCost";

export interface CreativeSortState {
  key: CreativeSortKey | null;
  dir: "asc" | "desc";
}

export interface CreativeTableProps {
  ads: FbCreativeEntity[];
  sort: CreativeSortState;
  onSort: (key: CreativeSortKey) => void;
  accounts: FbAccount[];
  onRowClick: (ad: FbCreativeEntity) => void;
}

interface Row {
  ad: FbCreativeEntity;
  accountName: string;
  campaignName: string;
  spend: number;
  clicks: number;
  ctr: number;
  cpc: number;
  msgs: number;
  msgCost: number;
}

function buildRow(ad: FbCreativeEntity): Row {
  const ins = getIns(ad);
  const spend = Number(ins.spend) || 0;
  const clicks = Number(ins.clicks) || 0;
  const ctr = Number(ins.ctr) || 0;
  const cpc = Number(ins.cpc) || 0;
  const msgs = getMsgCount(ad);
  const msgCost = msgs > 0 ? spend / msgs : 0;
  return {
    ad,
    accountName: ad._accountName ?? "",
    campaignName: ad.campaign?.name ?? "",
    spend,
    clicks,
    ctr,
    cpc,
    msgs,
    msgCost,
  };
}

function compareRows(a: Row, b: Row, key: CreativeSortKey): number {
  switch (key) {
    case "account":
      return a.accountName.localeCompare(b.accountName);
    case "campaign":
      return a.campaignName.localeCompare(b.campaignName);
    case "name":
      return a.ad.name.localeCompare(b.ad.name);
    case "spend":
      return a.spend - b.spend;
    case "clicks":
      return a.clicks - b.clicks;
    case "ctr":
      return a.ctr - b.ctr;
    case "cpc":
      return a.cpc - b.cpc;
    case "msgs":
      return a.msgs - b.msgs;
    case "msgCost":
      return a.msgCost - b.msgCost;
  }
}

export function CreativeTable({ ads, sort, onSort, accounts, onRowClick }: CreativeTableProps) {
  const rows = useMemo(() => ads.map(buildRow), [ads]);

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const key = sort.key;
    const mul = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => compareRows(a, b, key) * mul);
  }, [rows, sort.key, sort.dir]);

  // Totals row — sum aggregates across the current sorted (= filtered) view.
  const totalSpend = sorted.reduce((s, r) => s + r.spend, 0);
  const totalClicks = sorted.reduce((s, r) => s + r.clicks, 0);
  const totalMsgs = sorted.reduce((s, r) => s + r.msgs, 0);
  const totalMsgSpend = sorted.filter((r) => r.msgs > 0).reduce((s, r) => s + r.spend, 0);
  const avgCtr = totalSpend > 0 && totalClicks > 0
    ? // weighted avg approximation — spend-weighted CTR is more meaningful
      sorted.reduce((s, r) => s + r.ctr * r.spend, 0) / totalSpend
    : 0;
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const avgMsgCost = totalMsgs > 0 ? totalMsgSpend / totalMsgs : 0;

  return (
    <table className="w-full min-w-[960px] border-collapse text-[13px]">
      <thead>
        <tr>
          <th className="sticky top-0 z-[1] w-10 border-b border-border bg-bg px-2 py-2 text-left text-[11px] font-bold text-gray-500">
            No.
          </th>
          <SortHeader label="廣告帳號" sortKey="account" sort={sort} onSort={onSort} />
          <SortHeader label="行銷活動" sortKey="campaign" sort={sort} onSort={onSort} />
          <SortHeader label="第三層廣告" sortKey="name" sort={sort} onSort={onSort} />
          <SortHeader label="花費" sortKey="spend" sort={sort} onSort={onSort} right />
          <SortHeader label="點擊" sortKey="clicks" sort={sort} onSort={onSort} right />
          <SortHeader label="CTR" sortKey="ctr" sort={sort} onSort={onSort} right />
          <SortHeader label="CPC" sortKey="cpc" sort={sort} onSort={onSort} right />
          <SortHeader label="私訊數" sortKey="msgs" sort={sort} onSort={onSort} right />
          <SortHeader label="私訊成本" sortKey="msgCost" sort={sort} onSort={onSort} right />
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => {
          const businessId = accounts.find((a) => a.id === r.ad._accountId)?.business?.id;
          const href = fbAdLink(r.ad.id, r.ad._accountId, businessId);
          const thumb = r.ad.creative?.thumbnail_url;
          return (
            <tr
              key={r.ad.id}
              className="cursor-zoom-in border-b border-border bg-white hover:bg-[#fefaf7]"
              onClick={() => onRowClick(r.ad)}
            >
              <td className="w-10 px-2 text-center text-xs text-gray-300">{i + 1}</td>
              <td className="max-w-[140px] truncate px-2 text-[11px] text-gray-500" title={r.accountName}>
                {r.accountName}
              </td>
              <td className="max-w-[200px] truncate px-2 text-[12px] text-gray-500" title={r.campaignName}>
                {r.campaignName || "—"}
              </td>
              <td className="px-2">
                <div className="flex min-w-0 max-w-[280px] items-center gap-1.5">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className="h-[30px] w-[30px] shrink-0 rounded-sm border border-border object-cover"
                    />
                  ) : (
                    <div className="h-[30px] w-[30px] shrink-0 rounded-sm bg-bg" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={r.ad.name}>
                    {r.ad.name}
                  </span>
                  {href && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="在 Facebook 廣告管理員開啟"
                      aria-label={`在 Facebook 廣告管理員開啟 ${r.ad.name}`}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-300 hover:bg-orange-bg hover:text-orange"
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
                    </a>
                  )}
                </div>
              </td>
              <td className="px-2 text-right tabular-nums">${fM(r.spend)}</td>
              <td className="px-2 text-right tabular-nums">{fN(r.clicks)}</td>
              <td className="px-2 text-right tabular-nums">{fP(r.ctr)}</td>
              <td className="px-2 text-right tabular-nums">${fM(r.cpc)}</td>
              <td className="px-2 text-right tabular-nums">{r.msgs > 0 ? fN(r.msgs) : "—"}</td>
              <td className="px-2 text-right tabular-nums">
                {r.msgs > 0 ? `$${fM(r.msgCost)}` : "—"}
              </td>
            </tr>
          );
        })}
        {sorted.length > 0 && (
          <tr className="border-t-2 border-border-strong bg-bg">
            <td colSpan={4} className="px-2 py-1 text-[13px] font-bold text-ink">
              合計
            </td>
            <td className="px-2 py-1 text-right text-[13px] font-bold tabular-nums">
              ${fM(totalSpend)}
            </td>
            <td className="px-2 py-1 text-right text-[13px] font-bold tabular-nums">
              {fN(totalClicks)}
            </td>
            <td className="px-2 py-1 text-right text-[13px] font-bold tabular-nums">
              {avgCtr > 0 ? fP(avgCtr) : "—"}
            </td>
            <td className="px-2 py-1 text-right text-[13px] font-bold tabular-nums">
              {avgCpc > 0 ? `$${fM(avgCpc)}` : "—"}
            </td>
            <td className="px-2 py-1 text-right text-[13px] font-bold tabular-nums">
              {totalMsgs > 0 ? fN(totalMsgs) : "—"}
            </td>
            <td className="px-2 py-1 text-right text-[13px] font-bold tabular-nums">
              {avgMsgCost > 0 ? `$${fM(avgMsgCost)}` : "—"}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

/**
 * Skeleton placeholder for CreativeTable — renders the real column
 * headers + N shimmer rows so users see the eventual table shape
 * while the real data is loading. Much less jarring than a blank
 * area or a lone spinner on a first load that can take 5-15 seconds.
 */
export function CreativeTableSkeleton({ rows = 12 }: { rows?: number }) {
  return (
    <table className="w-full min-w-[960px] border-collapse text-[13px]">
      <thead>
        <tr>
          <th className="sticky top-0 z-[1] w-10 border-b border-border bg-bg px-2 py-2 text-left text-[11px] font-bold text-gray-500">
            No.
          </th>
          <th className="sticky top-0 z-[1] border-b border-border bg-bg px-2 py-2 text-left text-[11px] font-bold text-gray-500">
            廣告帳號
          </th>
          <th className="sticky top-0 z-[1] border-b border-border bg-bg px-2 py-2 text-left text-[11px] font-bold text-gray-500">
            行銷活動
          </th>
          <th className="sticky top-0 z-[1] border-b border-border bg-bg px-2 py-2 text-left text-[11px] font-bold text-gray-500">
            第三層廣告
          </th>
          <th className="sticky top-0 z-[1] border-b border-border bg-bg px-2 py-2 text-right text-[11px] font-bold text-gray-500">
            花費
          </th>
          <th className="sticky top-0 z-[1] border-b border-border bg-bg px-2 py-2 text-right text-[11px] font-bold text-gray-500">
            點擊
          </th>
          <th className="sticky top-0 z-[1] border-b border-border bg-bg px-2 py-2 text-right text-[11px] font-bold text-gray-500">
            CTR
          </th>
          <th className="sticky top-0 z-[1] border-b border-border bg-bg px-2 py-2 text-right text-[11px] font-bold text-gray-500">
            CPC
          </th>
          <th className="sticky top-0 z-[1] border-b border-border bg-bg px-2 py-2 text-right text-[11px] font-bold text-gray-500">
            私訊數
          </th>
          <th className="sticky top-0 z-[1] border-b border-border bg-bg px-2 py-2 text-right text-[11px] font-bold text-gray-500">
            私訊成本
          </th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, i) => (
          <tr
            // biome-ignore lint/suspicious/noArrayIndexKey: static positions
            key={i}
            className="border-b border-border bg-white"
          >
            <td className="w-10 px-2 py-1.5 text-center">
              <Skeleton width={14} height={11} />
            </td>
            <td className="px-2 py-1.5">
              <Skeleton width={90} height={11} />
            </td>
            <td className="px-2 py-1.5">
              <Skeleton width={140} height={12} />
            </td>
            <td className="px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <Skeleton width={30} height={30} radius={3} />
                <Skeleton width={180} height={12} />
              </div>
            </td>
            <td className="px-2 py-1.5 text-right">
              <Skeleton width={50} height={12} />
            </td>
            <td className="px-2 py-1.5 text-right">
              <Skeleton width={40} height={12} />
            </td>
            <td className="px-2 py-1.5 text-right">
              <Skeleton width={44} height={12} />
            </td>
            <td className="px-2 py-1.5 text-right">
              <Skeleton width={40} height={12} />
            </td>
            <td className="px-2 py-1.5 text-right">
              <Skeleton width={30} height={12} />
            </td>
            <td className="px-2 py-1.5 text-right">
              <Skeleton width={44} height={12} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  right,
}: {
  label: string;
  sortKey: CreativeSortKey;
  sort: CreativeSortState;
  onSort: (key: CreativeSortKey) => void;
  right?: boolean;
}) {
  const active = sort.key === sortKey;
  const arrow = active ? (sort.dir === "asc" ? " ↑" : " ↓") : "";
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={cn(
        "sticky top-0 z-[1] cursor-pointer select-none whitespace-nowrap border-b border-border bg-bg px-2 py-2 text-[11px] font-bold uppercase tracking-[0.3px]",
        right ? "text-right" : "text-left",
        active ? "text-orange" : "text-gray-500 hover:text-orange",
      )}
    >
      {label}
      {arrow}
    </th>
  );
}
