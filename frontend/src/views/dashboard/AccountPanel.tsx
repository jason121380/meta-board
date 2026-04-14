import { CollapseSidebarButton } from "@/components/CollapseSidebarButton";
import { EmptyState } from "@/components/EmptyState";
import { Loading } from "@/components/Loading";
import { StatusDot } from "@/components/StatusDot";
import { accountDotState } from "@/lib/accountStatus";
import { cn } from "@/lib/cn";
import { useUiStore } from "@/stores/uiStore";
import type { FbAccount } from "@/types/fb";

/**
 * Dashboard left column — 240px list of the user's visible accounts.
 * Selecting a row sets it as the single "active" account for the
 * dashboard view. Matches dashboard.html lines 870–877 +
 * `renderDashAcctList()` behavior.
 *
 * Empty states:
 *  - accounts still loading        → <Loading/>
 *  - 0 accounts enabled in Settings → inline hint
 *
 * Collapsed mode: when ``acctSidebarCollapsed`` is true, the panel
 * disappears completely and a small ``ExpandSidebarButton`` is
 * rendered at the very edge of the content area so the user can
 * bring it back. The collapsed flag lives in uiStore and persists
 * to localStorage so it survives page reloads.
 */

export interface AccountPanelProps {
  accounts: FbAccount[];
  activeAccountId: string | null;
  isLoading: boolean;
  onSelect: (account: FbAccount) => void;
}

export function AccountPanel({
  accounts,
  activeAccountId,
  isLoading,
  onSelect,
}: AccountPanelProps) {
  const collapsed = useUiStore((s) => s.acctSidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleAcctSidebar);

  if (collapsed) {
    return <ExpandSidebarButton onClick={toggle} />;
  }

  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-r border-border bg-bg">
      <div className="flex items-center justify-between border-b border-border bg-white px-3 pb-2 pt-2.5">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.6px] text-gray-300">廣告帳戶</h4>
        <CollapseSidebarButton onClick={toggle} />
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <Loading />
        ) : accounts.length === 0 ? (
          <EmptyState>請先在設定中啟用帳戶</EmptyState>
        ) : (
          accounts.map((acc) => {
            const active = activeAccountId === acc.id;
            return (
              <button
                type="button"
                key={acc.id}
                onClick={() => onSelect(acc)}
                className={cn(
                  "flex w-full cursor-pointer select-none items-center gap-2 border-b border-border px-3 py-2 text-left",
                  active ? "bg-orange-bg" : "hover:bg-orange-bg",
                )}
              >
                <StatusDot state={accountDotState(acc.account_status)} />
                <span
                  className={cn(
                    "flex-1 truncate text-xs font-medium",
                    active ? "font-semibold text-orange" : "text-ink",
                  )}
                  title={acc.name}
                >
                  {acc.name}
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

function ExpandSidebarButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="展開廣告帳戶"
      aria-label="展開廣告帳戶側欄"
      className="flex h-12 w-6 shrink-0 items-center justify-center self-start border-r border-b border-border bg-white text-gray-300 hover:bg-orange-bg hover:text-orange"
    >
      <span aria-hidden="true">▶</span>
    </button>
  );
}
