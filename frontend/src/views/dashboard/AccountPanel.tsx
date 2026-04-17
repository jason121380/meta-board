import { EmptyState } from "@/components/EmptyState";
import { Loading } from "@/components/Loading";
import { StatusDot } from "@/components/StatusDot";
import { accountDotState } from "@/lib/accountStatus";
import { cn } from "@/lib/cn";
import { useUiStore } from "@/stores/uiStore";
import type { FbAccount } from "@/types/fb";

/**
 * Dashboard left column — 180px list of the user's visible accounts.
 * Selecting a row sets it as the single "active" account for the
 * dashboard view.
 *
 * Empty states:
 *  - accounts still loading        → <Loading/>
 *  - 0 accounts enabled in Settings → inline hint
 *
 * Collapsed mode: when ``acctSidebarCollapsed`` is true the panel
 * renders nothing — the toggle button in the Topbar
 * (<AcctSidebarToggle/>) brings it back. The collapsed flag lives
 * in uiStore and persists to localStorage so it survives reloads.
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

  if (collapsed) return null;

  return (
    <aside className="sticky top-0 flex min-h-[calc(100dvh-64px)] w-[160px] shrink-0 flex-col border-r border-border bg-bg">
      <div className="border-b border-border bg-white px-3 pb-2 pt-2.5">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.6px] text-gray-300">廣告帳戶</h4>
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
