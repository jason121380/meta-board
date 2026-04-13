import { cn } from "@/lib/cn";

/**
 * Loading spinner — 18×18 px by default, with a 2px border and the
 * orange brand color on the top edge, rotating at 0.7s linear.
 *
 * Uses the global `.spinner` class from globals.css. Override via props
 * when a larger / smaller spinner is needed (e.g. 14px for inline tree
 * rows, 16px for the load-more row).
 */
export interface SpinnerProps {
  className?: string;
  size?: number;
}

export function Spinner({ className, size }: SpinnerProps) {
  if (size && size !== 18) {
    return (
      <span
        className={cn("spinner", className)}
        style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(size / 9)) }}
        aria-label="loading"
      />
    );
  }
  return <span className={cn("spinner", className)} aria-label="loading" />;
}
