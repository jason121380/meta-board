import { cn } from "@/lib/cn";
import { useUiStore } from "@/stores/uiStore";

/**
 * Topbar button that collapses / expands the desktop account sidebar
 * on Dashboard / Alerts / Finance. Lives next to the page title so
 * the affordance is always visible regardless of which account is
 * selected. Replaces the in-panel triangle button.
 *
 * Hidden on mobile (the mobile picker is a popup, not a sidebar).
 */
export function AcctSidebarToggle() {
  const collapsed = useUiStore((s) => s.acctSidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleAcctSidebar);

  return (
    <button
      type="button"
      onClick={toggle}
      title={collapsed ? "展開廣告帳戶側欄" : "收合廣告帳戶側欄"}
      aria-label={collapsed ? "展開廣告帳戶側欄" : "收合廣告帳戶側欄"}
      aria-pressed={collapsed}
      className={cn(
        "ml-1 hidden h-9 w-9 items-center justify-center rounded-xl border-none bg-transparent active:scale-95 md:flex",
        collapsed ? "text-ink hover:text-orange" : "text-orange",
      )}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* Hamburger icon — three horizontal lines. */}
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>
  );
}
