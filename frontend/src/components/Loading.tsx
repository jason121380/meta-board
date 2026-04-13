import { cn } from "@/lib/cn";
import type { ReactNode } from "react";
import { Spinner } from "./Spinner";

/**
 * Full-width loading state used inside view panels and tree containers.
 * Ported from the `.loading` block in dashboard.html — flex-center with
 * 60px vertical padding, 10px gap, gray-300 text.
 */
export interface LoadingProps {
  children?: ReactNode;
  className?: string;
}

export function Loading({ children, className }: LoadingProps) {
  return (
    <div
      className={cn("flex items-center justify-center gap-2.5 p-[60px] text-gray-300", className)}
    >
      <Spinner />
      {children ? <span>{children}</span> : null}
    </div>
  );
}
