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
  children?: ReactNode;
  className?: string;
}

export function Topbar({ title, children, className }: TopbarProps) {
  const toggle = useMobileSidebarToggle();
  return (
    <div
      className={cn(
        "flex min-h-[60px] shrink-0 items-center gap-3 border-b border-border bg-white px-6",
        "shadow-[0_1px_0_var(--border)] z-[50]",
        className,
      )}
    >
      <button
        type="button"
        aria-label="開啟選單"
        onClick={toggle}
        className="shell-hamburger hidden h-8 w-8 items-center justify-center rounded-lg border border-border text-xl leading-none text-ink hover:bg-orange-bg hover:text-orange"
      >
        ☰
      </button>
      <div className="text-base font-bold tracking-[-0.2px] text-ink">{title}</div>
      <div className="flex flex-1 items-center justify-end gap-3">{children}</div>
    </div>
  );
}

export function TopbarSeparator() {
  return <div className="h-5 w-px bg-border" />;
}
