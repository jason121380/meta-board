import { cn } from "@/lib/cn";
import type { DateConfig } from "@/lib/datePicker";
import { fM, fN } from "@/lib/format";
import { getIns, getMsgCount } from "@/lib/insights";
import { useUiStore } from "@/stores/uiStore";
import type { FbCampaign } from "@/types/fb";
import { useMemo } from "react";
import type { BudgetModalTarget } from "./BudgetModal";
import { CampaignRow } from "./CampaignRow";
import { type TreeCol, buildTreeCols } from "./treeCols";

/**
 * Three-level tree table orchestration. Accepts the already-filtered
 * campaigns list and renders header, CampaignRow children (which
 * themselves render AdsetRow → CreativeRow), and the totals row.
 *
 * Sort behavior: header click dispatches to uiStore.setTreeSort which
 * toggles the direction if the same key is clicked again. The sort
 * is applied here (not inside CampaignRow) because it affects row
 * ordering.
 */

export interface TreeTableProps {
  campaigns: FbCampaign[];
  multiAcct: boolean;
  date: DateConfig;
  onOpenBudget: (target: BudgetModalTarget) => void;
  searchTerm: string;
}

export function TreeTable({
  campaigns,
  multiAcct,
  date,
  onOpenBudget,
  searchTerm,
}: TreeTableProps) {
  const treeSort = useUiStore((s) => s.treeSort);
  const setTreeSort = useUiStore((s) => s.setTreeSort);

  const cols = useMemo(() => buildTreeCols(multiAcct), [multiAcct]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return campaigns;
    return campaigns.filter((c) => c.name.toLowerCase().includes(term));
  }, [campaigns, searchTerm]);

  const sorted = useMemo(() => {
    if (!treeSort.key) return filtered;
    const col = cols.find((c) => c.key === treeSort.key);
    if (!col?.sortKey) return filtered;
    const dir = treeSort.dir === "asc" ? 1 : -1;
    const sortKey = col.sortKey;
    return [...filtered].sort((a, b) => {
      const va = sortKey(a);
      const vb = sortKey(b);
      if (va === vb) return 0;
      return va > vb ? dir : -dir;
    });
  }, [filtered, cols, treeSort]);

  if (sorted.length === 0) {
    return <div className="p-[60px] text-center text-gray-300">無符合條件的行銷活動</div>;
  }

  // Totals
  const totalSpend = sorted.reduce((s, c) => s + (Number(getIns(c).spend) || 0), 0);
  const totalMsgs = sorted.reduce((s, c) => s + getMsgCount(c), 0);
  const totalMsgSpend = sorted
    .filter((c) => getMsgCount(c) > 0)
    .reduce((s, c) => s + (Number(getIns(c).spend) || 0), 0);

  return (
    <table className="tree w-full border-collapse text-[13px]">
      <thead>
        <tr>
          {cols.map((c) => (
            <TreeHeaderCell key={c.key} col={c} treeSort={treeSort} onSort={setTreeSort} />
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((campaign, idx) => (
          <CampaignRow
            key={campaign.id}
            campaign={campaign}
            index={idx}
            multiAcct={multiAcct}
            colCount={cols.length}
            date={date}
            onOpenBudget={onOpenBudget}
          />
        ))}
        {/* Totals row */}
        <tr className="border-t border-border bg-bg">
          <td colSpan={multiAcct ? 3 : 2} className="px-3.5 py-2.5 text-[13px] font-bold text-ink">
            合計
          </td>
          <td />
          <td className="num text-[13px] font-bold">${fM(totalSpend)}</td>
          <td />
          <td />
          <td />
          <td />
          <td className="num text-[13px] font-bold">{totalMsgs > 0 ? fN(totalMsgs) : "—"}</td>
          <td className="num text-[13px] font-bold">
            {totalMsgs > 0 ? `$${fM(totalMsgSpend / totalMsgs)}` : "—"}
          </td>
          <td colSpan={2} />
        </tr>
      </tbody>
    </table>
  );
}

function TreeHeaderCell({
  col,
  treeSort,
  onSort,
}: {
  col: TreeCol;
  treeSort: { key: string | null; dir: "asc" | "desc" };
  onSort: (key: string | null) => void;
}) {
  const sortable = !!col.sortKey;
  const isSorted = sortable && treeSort.key === col.key;
  return (
    <th
      onClick={sortable ? () => onSort(col.key) : undefined}
      className={cn(
        "sticky top-0 z-[1] whitespace-nowrap border-b border-border bg-bg px-3.5 py-2.5",
        "text-left text-[11px] font-semibold uppercase tracking-[0.5px]",
        isSorted ? "text-orange" : "text-gray-300",
        sortable && "cursor-pointer select-none hover:text-orange",
      )}
    >
      {col.label}
      {isSorted && (treeSort.dir === "asc" ? " ↑" : " ↓")}
    </th>
  );
}
