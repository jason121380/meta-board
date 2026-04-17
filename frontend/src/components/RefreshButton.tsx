import { cn } from "@/lib/cn";
import { Button } from "./Button";

/**
 * Refresh button used across views. Shows a spinning circular-arrow
 * while the query is fetching in the background (even after initial
 * load), so the user always knows when new data is in flight — no
 * more "is this broken or still loading?" confusion.
 *
 * Uses an inline SVG instead of the Unicode "↻" because the
 * Unicode glyph isn't reliably centered across fonts (it sits on a
 * different baseline than digits in Noto Sans TC, so it looks
 * vertically off in a flex container).
 */
export interface RefreshButtonProps {
  isFetching: boolean;
  onClick: () => void;
  title?: string;
}

export function RefreshButton({ isFetching, onClick, title = "重新整理 (強制從 FB 更新)" }: RefreshButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="h-10 w-10 justify-center px-0 transition-transform active:scale-90 md:h-[30px] md:w-[30px]"
      aria-busy={isFetching}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={cn(
          "block",
          // Slow spin when fetching so the user sees activity clearly.
          isFetching && "animate-[spin_1.2s_linear_infinite]",
        )}
      >
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    </Button>
  );
}
