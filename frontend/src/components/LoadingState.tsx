import { cn } from "@/lib/cn";
import type { ReactNode } from "react";
import { Spinner } from "./Spinner";

/**
 * Prominent loading state — larger and clearer than the tiny
 * <Loading/> primitive. Designed for the "user opens a view and
 * waits for multi-account data" case. Shows:
 *
 *   - A centered 28px spinner
 *   - A bold title line ("載入資料中...")
 *   - An optional subtitle (e.g. "3 / 5 個帳戶")
 *   - An optional progress bar showing loaded / total
 *
 * Designed to look OBVIOUSLY different from an empty state — no
 * gray-300 text, no ambiguous "—" placeholder, no risk the user
 * thinks the screen is broken.
 */

export interface LoadingStateProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Progress counts. If provided, renders a progress bar. */
  loaded?: number;
  total?: number;
  className?: string;
}

export function LoadingState({
  title = "載入資料中...",
  subtitle,
  loaded,
  total,
  className,
}: LoadingStateProps) {
  const showProgress = typeof loaded === "number" && typeof total === "number" && total > 0;
  const pct = showProgress ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  const effectiveSubtitle =
    subtitle ?? (showProgress ? `${loaded} / ${total} 個帳戶已載入` : undefined);

  return (
    <div
      className={cn(
        "flex min-h-[180px] flex-col items-center justify-center gap-3 px-6 py-12",
        className,
      )}
    >
      <Spinner size={28} />
      <div className="text-[14px] font-semibold text-ink">{title}</div>
      {effectiveSubtitle && <div className="text-[12px] text-gray-500">{effectiveSubtitle}</div>}
      {showProgress && (
        <div className="mt-1 h-1 w-[200px] overflow-hidden rounded-full bg-border">
          <div
            className="h-full bg-orange transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
