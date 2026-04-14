import { CollapseSidebarButton } from "@/components/CollapseSidebarButton";
import { cn } from "@/lib/cn";
import { fM } from "@/lib/format";
import { useUiStore } from "@/stores/uiStore";
import type { FinAccountRow } from "./financeData";

/**
 * Finance view left column — 480px wide, 3-column layout per row:
 *   [帳戶名稱] [花費] [花費+%]
 *
 * The first row is a synthetic "全部帳戶" aggregate. Clicking it
 * clears the per-account selection (empty finSelectedAcctIds = all).
 * Clicking any other row drills down to single-account mode.
 *
 * Collapsed mode: when ``acctSidebarCollapsed`` is true the panel
 * hides and an expand button takes its place.
 */

export interface FinanceAccountPanelProps {
  rows: FinAccountRow[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function FinanceAccountPanel({ rows, selectedId, onSelect }: FinanceAccountPanelProps) {
  const collapsed = useUiStore((s) => s.acctSidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleAcctSidebar);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggle}
        title="展開廣告帳戶"
        aria-label="展開廣告帳戶側欄"
        className="flex h-12 w-6 shrink-0 items-center justify-center self-start border-b border-r border-border bg-white text-gray-300 hover:bg-orange-bg hover:text-orange"
      >
        <span aria-hidden="true">▶</span>
      </button>
    );
  }

  return (
    <aside className="flex w-[480px] shrink-0 flex-col overflow-hidden border-r border-border bg-white">
      <div className="flex shrink-0 items-center border-b border-border bg-bg px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.5px] text-gray-500">
        <span className="flex-1">廣告帳號</span>
        <span className="w-[110px] text-right">花費</span>
        <span className="w-[120px] text-right">花費+%</span>
        <CollapseSidebarButton onClick={toggle} className="ml-1.5" />
      </div>
      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="px-3.5 py-3 text-xs text-gray-300">尚無帳戶</div>
        ) : (
          rows.map((row) => {
            const isAll = row.id === "__all__";
            const isActive = isAll ? selectedId === null : selectedId === row.id;
            return (
              <button
                type="button"
                key={row.id}
                onClick={() => onSelect(isAll ? null : row.id)}
                className={cn(
                  "flex w-full cursor-pointer items-center border-b border-border px-3.5 py-2.5 text-left",
                  isActive
                    ? "border-r-[3px] border-r-orange bg-orange-bg text-orange"
                    : "text-gray-500 hover:bg-orange-bg",
                )}
              >
                <div
                  className={cn(
                    "min-w-0 flex-1 truncate text-[13px]",
                    row.isTotal && "font-bold",
                    isActive && "font-semibold",
                  )}
                  title={row.label}
                >
                  {row.label}
                </div>
                <div className="w-[110px] text-right text-[13px] tabular-nums">
                  {row.loaded ? `$${fM(row.spend)}` : <span className="text-gray-300">…</span>}
                </div>
                <div
                  className={cn(
                    "w-[120px] text-right text-[13px] tabular-nums text-orange",
                    row.isTotal ? "font-bold" : "font-semibold",
                  )}
                >
                  {row.loaded ? (
                    `$${fM(Math.ceil(row.plus))}`
                  ) : (
                    <span className="text-gray-300">…</span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
