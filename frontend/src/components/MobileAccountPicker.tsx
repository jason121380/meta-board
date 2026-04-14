import { Modal } from "@/components/Modal";
import { StatusDot } from "@/components/StatusDot";
import { accountDotState } from "@/lib/accountStatus";
import { cn } from "@/lib/cn";
import type { FbAccount } from "@/types/fb";
import { useState } from "react";

/**
 * Mobile-only account picker — a single tap-target that displays the
 * currently selected account name, and opens a Modal listing all
 * available accounts when tapped. Replaces the desktop 240px sidebar
 * (<AlertAccountPanel/>, <AccountPanel/>, <FinanceAccountPanel/>) on
 * narrow viewports so the alert/dashboard/finance pages don't waste
 * vertical space on a horizontal-scrolling chip strip.
 *
 * Visibility is controlled by Tailwind utility classes on the parent:
 *   <div className="md:hidden"><MobileAccountPicker .../></div>
 *
 * Pass `selectedId={null}` and an empty selected label to represent
 * the "全部帳戶" (all-accounts) option, which is supported by
 * AlertsView and FinanceView (DashboardView always picks exactly one).
 */

export interface MobileAccountPickerProps {
  accounts: FbAccount[];
  /** Current selection, or null for "全部帳戶". */
  selectedId: string | null;
  /** Click handler. Called with null for the "all" row, otherwise the account id. */
  onSelect: (id: string | null) => void;
  /** Whether the "全部帳戶" entry should be rendered at the top of the list. */
  includeAllOption?: boolean;
  /** Label for the field shown above the button. Defaults to "廣告帳戶". */
  label?: string;
  className?: string;
}

export function MobileAccountPicker({
  accounts,
  selectedId,
  onSelect,
  includeAllOption = true,
  label = "廣告帳戶",
  className,
}: MobileAccountPickerProps) {
  const [open, setOpen] = useState(false);

  const currentName =
    selectedId === null
      ? includeAllOption
        ? "全部帳戶"
        : "請選擇帳戶"
      : (accounts.find((a) => a.id === selectedId)?.name ?? "請選擇帳戶");

  const handlePick = (id: string | null) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <div className={cn("flex shrink-0 items-center gap-2.5 bg-white px-4 py-2.5", className)}>
      <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-gray-300">
        {label}
      </span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-pill border-[1.5px] border-border bg-white px-4 text-left text-[14px] font-medium text-ink active:scale-[0.98] active:bg-orange-bg"
      >
        <span className="min-w-0 truncate">{currentName}</span>
        <span aria-hidden="true" className="text-[11px] text-gray-300">
          ▼
        </span>
      </button>

      <Modal open={open} onOpenChange={setOpen} title="選擇廣告帳戶" width={360} className="!p-0">
        <div className="max-h-[65vh] overflow-y-auto py-1">
          {includeAllOption && (
            <PickerRow
              active={selectedId === null}
              dotState="on"
              label="全部帳戶"
              onClick={() => handlePick(null)}
            />
          )}
          {accounts.map((a) => (
            <PickerRow
              key={a.id}
              active={selectedId === a.id}
              dotState={accountDotState(a.account_status)}
              label={a.name}
              onClick={() => handlePick(a.id)}
            />
          ))}
          {accounts.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-gray-300">尚無帳戶</div>
          )}
        </div>
      </Modal>
    </div>
  );
}

function PickerRow({
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
        "flex min-h-[48px] w-full cursor-pointer select-none items-center gap-2.5 border-b border-border px-4 py-3 text-left",
        active ? "bg-orange-bg" : "active:bg-orange-bg hover:bg-orange-bg",
      )}
    >
      <StatusDot state={dotState} />
      <span
        className={cn(
          "flex-1 truncate text-[14px] font-medium",
          active ? "font-semibold text-orange" : "text-ink",
        )}
        title={label}
      >
        {label}
      </span>
      {active && (
        <span aria-hidden="true" className="text-base text-orange">
          ✓
        </span>
      )}
    </button>
  );
}
