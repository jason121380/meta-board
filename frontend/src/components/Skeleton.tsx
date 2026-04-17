import { cn } from "@/lib/cn";
import type { CSSProperties } from "react";

/**
 * Shimmer placeholder — uses the same `shimmer` keyframe defined in
 * tailwind.config.ts. Drop-in replacement for a real element, with
 * adjustable width / height / rounding.
 *
 * Pattern ported from the original template `.skel` class so the visual is
 * identical to the legacy skeleton placeholders.
 */
export interface SkeletonProps {
  /** Width — any CSS unit. Default "100%". */
  width?: number | string;
  /** Height in px. Default 13. */
  height?: number | string;
  /** Border radius in px. Default 4. */
  radius?: number;
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({
  width = "100%",
  height = 13,
  radius = 4,
  className,
  style,
}: SkeletonProps) {
  return (
    <span
      className={cn("inline-block animate-shimmer", className)}
      style={{
        width,
        height,
        borderRadius: radius,
        background:
          "linear-gradient(90deg, var(--border) 25%, var(--warm-white) 50%, var(--border) 75%)",
        backgroundSize: "200% 100%",
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

/**
 * Skeleton table row — N cells of varying widths. The number and
 * widths are designed to approximate the real tree table / finance
 * table so the layout doesn't jump when real data loads.
 */
export function SkeletonTableRow({
  cellWidths,
  cellClass,
}: {
  cellWidths: Array<number | string>;
  cellClass?: string;
}) {
  return (
    <tr>
      {cellWidths.map((w, i) => (
        <td
          // biome-ignore lint/suspicious/noArrayIndexKey: static positions
          key={i}
          className={cn("px-3.5 py-3", cellClass)}
        >
          <Skeleton width={w} />
        </td>
      ))}
    </tr>
  );
}

/**
 * Full skeleton table — N rows of the same shape. Default is 6 rows
 * matching the legacy `renderFinanceTable()` fallback (line 3398).
 */
export function SkeletonTable({
  rows = 6,
  cellWidths,
}: {
  rows?: number;
  cellWidths: Array<number | string>;
}) {
  return (
    <tbody>
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static positions
        <SkeletonTableRow key={i} cellWidths={cellWidths} />
      ))}
    </tbody>
  );
}
