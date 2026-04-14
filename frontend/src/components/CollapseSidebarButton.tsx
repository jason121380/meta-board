import { cn } from "@/lib/cn";

/**
 * Tiny collapse button used in the account-list headers across
 * Dashboard / Alerts / Finance views. Clicking it sets
 * ``uiStore.acctSidebarCollapsed = true`` so the parent panel hides
 * itself and returns the horizontal space to the content area.
 *
 * The expand-back-out button lives inside each AccountPanel
 * implementation because the visual is panel-specific.
 */
export interface CollapseSidebarButtonProps {
  onClick: () => void;
  className?: string;
}

export function CollapseSidebarButton({ onClick, className }: CollapseSidebarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="收合側欄，給右邊更多空間"
      aria-label="收合廣告帳戶側欄"
      className={cn(
        "hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-[14px] text-gray-300 hover:bg-orange-bg hover:text-orange md:flex",
        className,
      )}
    >
      <span aria-hidden="true">◀</span>
    </button>
  );
}
