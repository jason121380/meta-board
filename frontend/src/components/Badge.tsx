import { cn } from "@/lib/cn";
import type { FbEntityStatus } from "@/types/fb";

/**
 * Status badge — pill-shaped 11px semi-bold label. Ported from
 * `.badge` / `.badge-active` / `.badge-paused` / `.badge-other`
 * CSS classes in the original design. Uses the global classes from
 * globals.css so the color scheme is consistent across views.
 */

export interface BadgeProps {
  status: FbEntityStatus;
  className?: string;
}

const LABELS: Record<string, string> = {
  ACTIVE: "進行中",
  PAUSED: "已暫停",
  ARCHIVED: "已封存",
  DELETED: "已刪除",
};

export function Badge({ status, className }: BadgeProps) {
  if (status === "ACTIVE") {
    return <span className={cn("badge badge-active", className)}>進行中</span>;
  }
  if (status === "PAUSED") {
    return <span className={cn("badge badge-paused", className)}>已暫停</span>;
  }
  return <span className={cn("badge badge-other", className)}>{LABELS[status] ?? status}</span>;
}
