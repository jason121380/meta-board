import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * Top bar — 60px tall, white background, bottom border, shadow-sm.
 * Shared container for every view's top strip (page title + date
 * picker + refresh button + any per-view controls).
 *
 * Views provide their own children; Topbar just owns the container
 * box. A thin "topbar-sep" divider is exposed as a sibling component.
 */

export interface TopbarProps {
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Topbar({ title, children, className }: TopbarProps) {
  return (
    <div
      className={cn(
        "flex min-h-[60px] shrink-0 items-center gap-3 border-b border-border bg-white px-6",
        "shadow-[0_1px_0_var(--border)] z-[50]",
        className,
      )}
    >
      <div className="text-base font-bold tracking-[-0.2px] text-ink">{title}</div>
      <div className="flex flex-1 items-center justify-end gap-3">{children}</div>
    </div>
  );
}

export function TopbarSeparator() {
  return <div className="h-5 w-px bg-border" />;
}
