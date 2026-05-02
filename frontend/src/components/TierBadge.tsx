import type { TierId } from "@/api/client";
import { cn } from "@/lib/cn";

/**
 * Pill badge that surfaces the user's subscription tier next to
 * their name in the sidebar (and anywhere else we want a glance-
 * able plan signal). Each tier has its own colour treatment so
 * Free / Basic / Plus / Max are distinguishable without reading
 * the label.
 *
 * `Max` uses solid orange to match the "premium" CTA colour
 * elsewhere; `Plus` uses orange tint as a step down; `Basic` uses
 * neutral but accented; `Free` is muted gray.
 */

interface TierStyle {
  label: string;
  className: string;
}

const TIER_STYLES: Record<TierId, TierStyle> = {
  free: {
    label: "Free",
    className: "bg-gray-100 text-gray-500",
  },
  basic: {
    label: "Basic",
    className: "bg-sky-50 text-sky-600",
  },
  plus: {
    label: "Plus",
    className: "bg-orange-bg text-orange",
  },
  max: {
    // Solid orange — Max is the visual top of the ladder, matches
    // the "primary" Button variant. White text on orange = max
    // contrast, reads as a "you're on the best plan" signal.
    label: "Max",
    className: "bg-orange text-white",
  },
};

export interface TierBadgeProps {
  tier: TierId;
  /** When true, prefix the label with a small ✦ to mark the user
   *  as grandfathered (LURE internal). Visually distinct from a
   *  regular paying Max user. */
  grandfathered?: boolean;
  size?: "sm" | "xs";
  className?: string;
}

export function TierBadge({ tier, grandfathered, size = "xs", className }: TierBadgeProps) {
  const style = TIER_STYLES[tier];
  if (!style) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wider",
        size === "xs" ? "px-1.5 py-[1px] text-[9px]" : "px-2 py-0.5 text-[10px]",
        style.className,
        className,
      )}
    >
      {grandfathered && tier === "max" && <span aria-hidden="true">✦</span>}
      {style.label}
    </span>
  );
}
