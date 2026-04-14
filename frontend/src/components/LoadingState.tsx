import { cn } from "@/lib/cn";
import type { ReactNode } from "react";
import { Spinner } from "./Spinner";

/**
 * Prominent loading state — larger and clearer than the tiny
 * <Loading/> primitive. Designed for the "user opens a view and
 * waits for multi-account data" case. Shows:
 *
 *   - A centered 32px spinner
 *   - A bold title line ("載入資料中...")
 *   - An optional subtitle (e.g. "3 / 5 個帳戶")
 *   - An optional progress bar showing loaded / total
 *
 * Designed to look OBVIOUSLY different from an empty state — no
 * gray-300 text, no ambiguous "—" placeholder, no risk the user
 * thinks the screen is broken.
 *
 * Progress display rules:
 *   - total > 1 AND loaded > 0 → determinate bar at loaded/total %
 *   - total > 1 AND loaded = 0 → indeterminate shimmer bar
 *   - total ≤ 1               → no counter, no bar (single fetch
 *                                is binary, a 0/1 counter is noise)
 */

export interface LoadingStateProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Progress counts. If provided, renders a progress bar. */
  loaded?: number;
  total?: number;
  /** Optional hint line below the subtitle — use to set user
   * expectations about how long the load usually takes (e.g.
   * "首次載入約需 5-15 秒"). Rendered in smaller muted text. */
  hint?: ReactNode;
  className?: string;
}

export function LoadingState({
  title = "載入資料中...",
  subtitle,
  loaded,
  total,
  hint,
  className,
}: LoadingStateProps) {
  const loadedSafe = typeof loaded === "number" ? loaded : 0;
  // Only show the progress counter / bar when there are at least
  // two concurrent fetches. A single fetch can only be 0/1, which
  // is noise — a plain spinner reads better.
  const showProgress = typeof total === "number" && total > 1;
  const pct = showProgress ? Math.min(100, Math.round((loadedSafe / total) * 100)) : 0;
  // When the user hasn't seen anything load yet, animate the bar
  // with an indeterminate shimmer instead of freezing at 0%.
  const indeterminate = showProgress && loadedSafe === 0;
  const effectiveSubtitle =
    subtitle ?? (showProgress ? `${loadedSafe} / ${total} 個帳戶已載入` : undefined);

  return (
    <div
      className={cn(
        "flex min-h-[180px] flex-col items-center justify-center gap-3 px-6 py-12",
        className,
      )}
    >
      <Spinner size={32} />
      <div className="text-[14px] font-semibold text-ink">{title}</div>
      {effectiveSubtitle && <div className="text-[12px] text-gray-500">{effectiveSubtitle}</div>}
      {showProgress && (
        <div className="mt-1 h-1 w-[200px] overflow-hidden rounded-full bg-border">
          {indeterminate ? (
            <div
              className="h-full w-full rounded-full bg-gradient-to-r from-orange-bg via-orange to-orange-bg bg-[length:200%_100%] animate-shimmer"
              aria-hidden="true"
            />
          ) : (
            <div
              className="h-full bg-orange transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
      )}
      {hint && (
        <div className="mt-1 max-w-[280px] text-center text-[11px] leading-relaxed text-gray-300">
          {hint}
        </div>
      )}
    </div>
  );
}
