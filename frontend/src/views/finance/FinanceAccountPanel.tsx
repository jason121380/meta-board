import { StatusDot } from "@/components/StatusDot";
import { cn } from "@/lib/cn";
import { fM } from "@/lib/format";
import { useUiStore } from "@/stores/uiStore";
import type { FinAccountRow } from "./financeData";

/**
 * Finance view left column — matches the Dashboard AccountPanel
 * look-and-feel (compact green-dot rows on a bg-bg column) but adds
 * two extra money columns on the right of every row:
 *   ● [帳戶名稱]   [花費]   [花費+%]
 *
 * Width is 360px on desktop so we stay narrower than the old 480px
 * but still leave room for the two right-aligned money cells.
 *
 * Collapsed mode: when ``acctSidebarCollapsed`` is true the panel
 * renders nothing — the topbar <AcctSidebarToggle/> brings it back.
 */

export interface FinanceAccountPanelProps {
  rows: FinAccountRow[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function FinanceAccountPanel({ rows, selectedId, onSelect }: FinanceAccountPanelProps) {
  const collapsed = useUiStore((s) => s.acctSidebarCollapsed);

  if (collapsed) return null;

  return (
    <aside className="sticky top-0 flex min-h-[calc(100dvh-64px)] w-[300px] shrink-0 flex-col border-r border-border bg-bg">
      <div className="border-b border-border bg-white px-3 pb-2 pt-2.5">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.6px] text-gray-300">廣告帳戶</h4>
      </div>
      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="px-3 py-3 text-xs text-gray-300">尚無帳戶</div>
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
                  "flex w-full cursor-pointer select-none items-center gap-2 border-b border-border px-3 py-2 text-left",
                  isActive ? "bg-orange-bg" : "hover:bg-orange-bg",
                )}
              >
                <StatusDot state={row.dotState} />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-xs font-medium",
                    isActive ? "font-semibold text-orange" : "text-ink",
                    row.isTotal && "font-bold",
                  )}
                  title={row.label}
                >
                  {row.label}
                </span>
                <span className="w-[70px] shrink-0 text-right text-[11px] tabular-nums text-gray-500">
                  {row.loaded ? `$${fM(row.spend)}` : <span className="text-gray-300">…</span>}
                </span>
                <span
                  className={cn(
                    "w-[70px] shrink-0 text-right text-[11px] tabular-nums text-orange",
                    row.isTotal ? "font-bold" : "font-semibold",
                  )}
                >
                  {row.loaded ? (
                    `$${fM(Math.ceil(row.plus))}`
                  ) : (
                    <span className="text-gray-300">…</span>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
