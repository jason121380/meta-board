import { MobileUserAvatar } from "@/components/MobileUserAvatar";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * Top bar — 60px tall, white background, bottom border, shadow-sm.
 * Shared container for every view's top strip (page title + date
 * picker + refresh button + any per-view controls).
 *
 * Mobile (≤768px): the leftmost item is a circular user avatar that
 * opens a logout modal (the desktop sidebar's user dropdown is hidden
 * behind the BottomTabBar on phones, so this is the only logout entry
 * point). The legacy hamburger is no longer rendered on mobile — the
 * sidebar nav was fully replaced by the bottom tab bar.
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
      <MobileUserAvatar />
      <div className="hidden min-w-0 shrink-0 truncate text-[15px] font-bold tracking-[-0.2px] text-ink md:block md:text-base">
        {title}
      </div>
      {titleAction}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 md:gap-3">{children}</div>
    </div>
  );
}

export function TopbarSeparator() {
  // Hidden on mobile (< 768px) — the Topbar there uses the account
  // picker's `mr-auto` to split left vs right, so the middle vertical
  // rule is redundant visual noise.
  return <div className="hidden h-5 w-px bg-border md:block" />;
}
