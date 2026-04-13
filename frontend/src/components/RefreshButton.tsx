import { cn } from "@/lib/cn";
import { Button } from "./Button";

/**
 * Refresh button used across views. Shows a spinning ↻ while the
 * query is fetching in the background (even after initial load),
 * so the user always knows when new data is in flight — no more
 * "is this broken or still loading?" confusion.
 */
export interface RefreshButtonProps {
  isFetching: boolean;
  onClick: () => void;
  title?: string;
}

export function RefreshButton({ isFetching, onClick, title = "重新整理" }: RefreshButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      title={title}
      onClick={onClick}
      className="px-2.5 text-base"
      aria-busy={isFetching}
    >
      <span
        className={cn(
          "inline-block",
          // Slow spin when fetching so the user sees activity clearly.
          isFetching && "animate-[spin_1.2s_linear_infinite]",
        )}
      >
        ↻
      </span>
    </Button>
  );
}
