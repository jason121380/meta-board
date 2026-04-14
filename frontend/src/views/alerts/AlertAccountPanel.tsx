import { CollapseSidebarButton } from "@/components/CollapseSidebarButton";
import { StatusDot } from "@/components/StatusDot";
import { accountDotState } from "@/lib/accountStatus";
import { cn } from "@/lib/cn";
import { useUiStore } from "@/stores/uiStore";
import type { FbAccount } from "@/types/fb";

/**
 * Alerts view left column — similar to AccountPanel in dashboard but
 * adds an "all accounts" option at the top (null id). Ported from
 * dashboard.html `renderAlertAcctList()` lines 2919–2933.
 *
 * Collapsed mode: when ``acctSidebarCollapsed`` is true the panel
 * hides and an expand button takes its place.
 */

export interface AlertAccountPanelProps {
  accounts: FbAccount[];
  selectedAccountId: string | null;
  onSelect: (id: string | null) => void;
}

export function AlertAccountPanel({
  accounts,
  selectedAccountId,
  onSelect,
}: AlertAccountPanelProps) {
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
    <aside className="flex w-[240px] shrink-0 flex-col overflow-y-auto border-r border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-gray-300">
          廣告帳戶
        </span>
        <CollapseSidebarButton onClick={toggle} />
      </div>
      <div className="flex-1 overflow-y-auto">
        <AcctButton
          active={selectedAccountId === null}
          dotState="on"
          label="全部帳戶"
          onClick={() => onSelect(null)}
        />
        {accounts.map((a) => (
          <AcctButton
            key={a.id}
            active={selectedAccountId === a.id}
            dotState={accountDotState(a.account_status)}
            label={a.name}
            onClick={() => onSelect(a.id)}
          />
        ))}
      </div>
    </aside>
  );
}

function AcctButton({
  active,
  dotState,
  label,
  onClick,
}: {
  active: boolean;
  dotState: "on" | "off";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer select-none items-center gap-2 border-b border-border px-3 py-2 text-left",
        active ? "bg-orange-bg" : "hover:bg-orange-bg",
      )}
    >
      <StatusDot state={dotState} />
      <span
        className={cn(
          "flex-1 truncate text-xs font-medium",
          active ? "font-semibold text-orange" : "text-ink",
        )}
        title={label}
      >
        {label}
      </span>
    </button>
  );
}
