import { cn } from "@/lib/cn";
import type { ReactNode } from "react";
import { useMobileSidebarToggle } from "./Shell";

/**
 * Top bar — 60px tall, white background, bottom border, shadow-sm.
 * Shared container for every view's top strip (page title + date
 * picker + refresh button + any per-view controls).
 *
 * Mobile (≤768px): reveals a hamburger button on the left that
 * toggles the sidebar. Desktop: the hamburger is hidden by the
 * `.shell-hamburger` class in globals.css.
 */

export interface TopbarProps {
  title: ReactNode;
  /** Optional control rendered immediately after the title — used by
   * Dashboard/Alerts/Finance to mount the account-sidebar collapse
   * toggle right next to the page title. */
  titleAction?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Topbar({ title, titleAction, children, className }: TopbarProps) {
  const toggle = useMobileSidebarToggle();
  return (
    <div
      // PWA safe-area: on iOS standalone, viewport-fit=cover puts the
      // status bar (time, signal, battery) on top of y=0. Without
      // padding-top: env(safe-area-inset-top), the topbar's content
      // lives UNDER the status bar. The inline style is mobile-only;
      // desktop browsers return 0 for the env() which is a no-op.
      style={{ paddingTop: "env(safe-area-inset-top)" }}
      className={cn(
        "sticky top-0 z-[50] flex min-h-[56px] shrink-0 items-center gap-2 border-b border-border bg-white px-3",
        "md:min-h-[60px] md:gap-3 md:px-6",
        "shadow-[0_1px_0_var(--border)]",
        className,
      )}
    >
      <button
        type="button"
        aria-label="開啟選單"
        onClick={toggle}
        className="shell-hamburger -ml-1 hidden h-11 w-11 items-center justify-center rounded-xl border border-border text-ink active:scale-95 active:bg-orange-bg active:text-orange"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <div className="min-w-0 shrink-0 truncate text-[15px] font-bold tracking-[-0.2px] text-ink md:text-base">
        {title}
      </div>
      {titleAction}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 md:gap-3">{children}</div>
    </div>
  );
}

export function TopbarSeparator() {
  return <div className="h-5 w-px bg-border" />;
}
