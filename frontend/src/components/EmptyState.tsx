import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * Empty-state placeholder — 60px padding, center-aligned, gray-300 text.
 * Ported from `.empty-state` in the original design. Used when a list or
 * table has no content to render.
 */
export interface EmptyStateProps {
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function EmptyState({ icon, children, className }: EmptyStateProps) {
  return (
    <div className={cn("p-[60px] text-center text-gray-300", className)}>
      {icon && <div className="mb-2.5 text-[36px]">{icon}</div>}
      {children}
    </div>
  );
}
