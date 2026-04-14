import { api } from "@/api/client";
import { useFbAuth } from "@/auth/FbAuthProvider";
import { cn } from "@/lib/cn";
import type { DateConfig } from "@/lib/datePicker";
import { fM, fN } from "@/lib/format";
import { getIns, getMsgCount } from "@/lib/insights";
import { useUiStore } from "@/stores/uiStore";
import type { FbCreativeEntity } from "@/types/fb";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { CreativeRow } from "./CreativeRow";
import { type TreeCol, buildTreeCols } from "./treeCols";

/**
 * "素材比較" (creative comparison) flat view for the Dashboard.
 *
 * When the user ticks the 素材比較 checkbox in the search row, the
 * normal 3-level tree collapses into a flat list containing ONLY the
 * 3rd-level ad creatives from adsets the user currently has expanded.
 * Campaign / adset rows are omitted so the user can compare creatives
 * side-by-side without the hierarchy noise.
 *
 * Data comes from the react-query cache: the creatives for every
 * expanded adset were already fetched when the user opened them, so
 * in the normal case this component's `useQueries` call resolves
 * instantly from cache. If the user toggles comparison mode before
 * any adset is expanded, the view shows a hint telling them to
 * expand an adset first — we deliberately don't auto-fetch every
 * adset in every campaign because that would explode API usage.
 */
export interface ComparisonTableProps {
  multiAcct: boolean;
  date: DateConfig;
  searchTerm: string;
}

export function ComparisonTable({ multiAcct, date, searchTerm }: ComparisonTableProps) {
  const { status } = useFbAuth();
  const expandedAdsets = useUiStore((s) => s.expandedAdsets);
  const treeSort = useUiStore((s) => s.treeSort);
  const setTreeSort = useUiStore((s) => s.setTreeSort);

  const cols = useMemo(() => buildTreeCols(multiAcct), [multiAcct]);

  // React Query shares cache by `queryKey`, so hitting the same
  // ["creatives", adsetId, date] tuple that `useCreatives` already
  // populated in `AdsetRow` means this useQueries call is almost
  // always a cache hit rather than a fresh FB round-trip.
  const queries = useQueries({
    queries: expandedAdsets.map((adsetId) => ({
      queryKey: ["creatives", adsetId, date] as const,
      queryFn: async (): Promise<FbCreativeEntity[]> => {
        const res = await api.adsets.creatives(adsetId, date);
        return res.data ?? [];
      },
      enabled: status === "auth",
      staleTime: 5 * 60_000,
    })),
  });

  const allCreatives = useMemo(() => {
    const out: FbCreativeEntity[] = [];
    for (const q of queries) {
      if (q.data) out.push(...q.data);
    }
    return out;
  }, [queries]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return allCreatives;
    return allCreatives.filter((c) => c.name.toLowerCase().includes(term));
  }, [allCreatives, searchTerm]);

  const sorted = useMemo(() => {
    if (!treeSort.key) return filtered;
    const col = cols.find((c) => c.key === treeSort.key);
    if (!col?.sortKey) return filtered;
    const sortKey = col.sortKey;
    const dir = treeSort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = sortKey(a);
      const vb = sortKey(b);
      if (va === vb) return 0;
      return va > vb ? dir : -dir;
    });
  }, [filtered, cols, treeSort]);

  if (expandedAdsets.length === 0) {
    return (
      <div className="p-[60px] text-center text-[13px] text-gray-300">
        請先展開任一行銷活動與廣告組合,再啟用素材比較
      </div>
    );
  }

  const isLoading = queries.some((q) => q.isLoading);

  if (isLoading && sorted.length === 0) {
    return <div className="p-[60px] text-center text-[13px] text-gray-300">載入素材中…</div>;
  }

  if (sorted.length === 0) {
    return <div className="p-[60px] text-center text-gray-300">無符合條件的素材</div>;
  }

  // Totals — spend across all visible creatives, plus message-cost
  // using the denominator-sanity rule from MEMORY.md (only sum spend
  // from creatives that HAVE msg data).
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
            <ComparisonHeaderCell key={c.key} col={c} treeSort={treeSort} onSort={setTreeSort} />
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((creative) => (
          <CreativeRow key={creative.id} creative={creative} multiAcct={multiAcct} />
        ))}
        <tr className="border-t-2 border-border-strong bg-bg">
          <td colSpan={multiAcct ? 3 : 2} className="px-3.5 py-2.5 text-[13px] font-bold text-ink">
            合計 ({sorted.length})
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

function ComparisonHeaderCell({
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
