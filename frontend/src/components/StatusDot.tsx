import { cn } from "@/lib/cn";

/**
 * 8×8 px colored dot used in the dash-acct-item account list rows.
 * Green = account enabled / active, gray = disabled.
 *
 * Ported from `.dash-acct-dot.on` / `.dash-acct-dot.off` CSS rules.
 */
export interface StatusDotProps {
  state: "on" | "off";
  className?: string;
}

export function StatusDot({ state, className }: StatusDotProps) {
  return (
    <span
      className={cn(
        "block h-2 w-2 shrink-0 rounded-full",
        state === "on" ? "bg-green" : "bg-gray-300",
        className,
      )}
    />
  );
}
