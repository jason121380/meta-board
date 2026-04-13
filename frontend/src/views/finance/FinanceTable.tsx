import { cn } from "@/lib/cn";
import { fM } from "@/lib/format";
import { spendOf } from "@/lib/insights";
import { useFinanceStore } from "@/stores/financeStore";
import { useUiStore } from "@/stores/uiStore";
import type { FbCampaign, FbEntityStatus } from "@/types/fb";
import { useMemo } from "react";
import {
  type FinSortKey,
  type FinSortState,
  filterFinanceRows,
  markupFor,
  sortFinanceRows,
  spendPlus,
} from "./financeData";

/**
 * The main finance table. Supports two modes:
 *   - single account selected   → no 廣告帳號 column
 *   - all accounts (selectedIds empty) → include 廣告帳號 column
 *
 * Row features:
 *   - Per-row markup % editable inline (persists via financeStore)
 *   - Pin-to-top via 📌 button; pinned rows always sort before unpinned
 *   - Spend+markup column shown in orange bold
 *   - Status badge (custom, since Finance uses slightly different
 *     styling than the dashboard badges)
 *
 * Sort state lives in uiStore.finSort so the selection persists
 * across view switches.
 */

export interface FinanceTableProps {
  campaigns: FbCampaign[];
  multiAcct: boolean;
  search: string;
  hideZero: boolean;
}

export function FinanceTable({ campaigns, multiAcct, search, hideZero }: FinanceTableProps) {
  const rowMarkups = useFinanceStore((s) => s.rowMarkups);
  const defaultMarkup = useFinanceStore((s) => s.defaultMarkup);
  const setRowMarkup = useFinanceStore((s) => s.setRowMarkup);
  const pinnedIds = useFinanceStore((s) => s.pinnedIds);
  const togglePin = useFinanceStore((s) => s.togglePin);

  const finSort = useUiStore((s) => s.finSort);
  const setFinSort = useUiStore((s) => s.setFinSort);

  const visible = useMemo(() => {
    const sortState: FinSortState = {
      key: (finSort.key as FinSortKey) ?? null,
      dir: finSort.dir,
    };
    const filtered = filterFinanceRows(campaigns, hideZero, search);
    return sortFinanceRows(filtered, sortState, pinnedIds, rowMarkups, defaultMarkup);
  }, [campaigns, hideZero, search, finSort.key, finSort.dir, pinnedIds, rowMarkups, defaultMarkup]);

  const spendSum = visible.reduce((s, c) => s + spendOf(c), 0);
  const plusSum = visible.reduce((s, c) => {
    const m = markupFor(c.id, rowMarkups, defaultMarkup);
    return s + spendPlus(spendOf(c), m);
  }, 0);

  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr>
          <th className="sticky top-0 z-[1] w-10 border-b border-border bg-bg px-3 py-2 text-left text-[11px] font-bold text-gray-500">
            No.
          </th>
          <th className="sticky top-0 z-[1] w-20 border-b border-border bg-bg px-3 py-2 text-left text-[11px] font-bold text-gray-500">
            狀態
          </th>
          {multiAcct && (
            <SortHeader label="廣告帳號" sortKey="acct" sort={finSort} onSort={setFinSort} />
          )}
          <SortHeader label="行銷活動名稱" sortKey="name" sort={finSort} onSort={setFinSort} />
          <SortHeader label="花費" sortKey="spend" sort={finSort} onSort={setFinSort} />
          <SortHeader label="月%" sortKey="markup" sort={finSort} onSort={setFinSort} right />
          <SortHeader label="花費+%" sortKey="plus" sort={finSort} onSort={setFinSort} right />
          <th className="sticky top-0 z-[1] w-12 border-b border-border bg-bg px-3 py-2 text-center text-[11px] font-bold text-gray-500">
            Pin
          </th>
        </tr>
      </thead>
      <tbody>
        {visible.length === 0 ? (
          <tr>
            <td
              colSpan={multiAcct ? 8 : 7}
              className="px-5 py-10 text-center text-xs text-gray-300"
            >
              無花費資料
            </td>
          </tr>
        ) : (
          visible.map((camp, i) => {
            const sp = spendOf(camp);
            const m = markupFor(camp.id, rowMarkups, defaultMarkup);
            const plus = spendPlus(sp, m);
            const isPinned = pinnedIds.includes(camp.id);
            return (
              <tr
                key={camp.id}
                className={cn(
                  "border-b border-border",
                  isPinned && "border-l-[3px] border-l-orange bg-orange-bg",
                )}
              >
                <td className="w-10 px-3 py-2 text-gray-500">{i + 1}</td>
                <td className="w-20 px-3 py-2">
                  <FinanceStatusBadge status={camp.status} />
                </td>
                {multiAcct && (
                  <td
                    className="max-w-[120px] truncate px-3 py-2 text-[11px] text-gray-500"
                    title={camp._accountName ?? ""}
                  >
                    {camp._accountName ?? ""}
                  </td>
                )}
                <td className="px-3 py-2 font-medium" title={camp.name}>
                  <div className={cn("truncate", multiAcct ? "max-w-[280px]" : "max-w-[320px]")}>
                    {camp.name}
                  </div>
                </td>
                <td className="px-3 py-2 tabular-nums">${fM(sp)}</td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    value={m}
                    min={0}
                    max={999}
                    step={0.5}
                    onChange={(e) => {
                      const v = Number.parseFloat(e.currentTarget.value);
                      if (!Number.isNaN(v)) setRowMarkup(camp.id, v);
                    }}
                    className="h-6 w-[52px] rounded border-[1.5px] border-border bg-white px-1 text-center text-xs"
                  />
                  %
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-orange">
                  ${fM(plus)}
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    type="button"
                    title={isPinned ? "取消置頂" : "置頂"}
                    onClick={() => togglePin(camp.id)}
                    className={cn(
                      "cursor-pointer border-none bg-transparent px-1.5 py-0.5 text-base",
                      isPinned ? "opacity-100" : "opacity-25 hover:opacity-60",
                    )}
                  >
                    📌
                  </button>
                </td>
              </tr>
            );
          })
        )}
        {visible.length > 0 && (
          <tr className="border-t-2 border-border-strong bg-bg">
            <td colSpan={multiAcct ? 4 : 3} className="px-3 py-2.5 text-[13px] font-bold text-ink">
              合計
            </td>
            <td className="px-3 py-2.5 text-[13px] font-bold tabular-nums">${fM(spendSum)}</td>
            <td />
            <td className="px-3 py-2.5 text-right text-[13px] font-bold tabular-nums text-orange">
              ${fM(plusSum)}
            </td>
            <td />
          </tr>
        )}
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
  sortKey: FinSortKey;
  sort: { key: string | null; dir: "asc" | "desc" };
  onSort: (key: string | null) => void;
  right?: boolean;
}) {
  const active = sort.key === sortKey;
  const arrow = active ? (sort.dir === "asc" ? " ↑" : " ↓") : "";
  return (
    <th
      onClick={() => sortKey && onSort(sortKey)}
      className={cn(
        "sticky top-0 z-[1] cursor-pointer select-none whitespace-nowrap border-b border-border bg-bg px-3 py-2 text-[11px] font-bold",
        right ? "text-right" : "text-left",
        active ? "text-orange" : "text-gray-500",
      )}
    >
      {label}
      {arrow}
    </th>
  );
}

function FinanceStatusBadge({ status }: { status: FbEntityStatus }) {
  if (status === "ACTIVE") {
    return (
      <span className="inline-block rounded-[10px] bg-[#E8F5E9] px-[7px] py-[2px] text-[11px] font-semibold text-[#2E7D32]">
        進行中
      </span>
    );
  }
  if (status === "PAUSED") {
    return (
      <span className="inline-block rounded-[10px] bg-[#F5F5F5] px-[7px] py-[2px] text-[11px] font-semibold text-[#757575]">
        暫停
      </span>
    );
  }
  if (status === "ARCHIVED") {
    return (
      <span className="inline-block rounded-[10px] bg-[#EEEEEE] px-[7px] py-[2px] text-[11px] font-semibold text-[#9E9E9E]">
        已封存
      </span>
    );
  }
  return (
    <span className="inline-block rounded-[10px] bg-[#FFEBEE] px-[7px] py-[2px] text-[11px] font-semibold text-[#B71C1C]">
      {status === "DELETED" ? "已刪除" : String(status)}
    </span>
  );
}
