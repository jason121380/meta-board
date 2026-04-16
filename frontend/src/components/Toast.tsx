import { cn } from "@/lib/cn";
import { hapticSuccess, hapticWarning } from "@/lib/haptic";
import { useEffect } from "react";
import { create } from "zustand";

/**
 * Tiny global toast system — sibling of ConfirmDialog. One toast at
 * a time; calling `toast()` while one is visible immediately
 * replaces it. Auto-dismiss after `duration` ms (default 2500).
 *
 * Usage:
 *   import { toast } from "@/components/Toast";
 *   toast("儲存成功");
 *   toast("上傳失敗", "error");
 *
 * Mount `<ToastHost/>` once at the root of the app (via App.tsx)
 * for the toasts to actually render.
 */

export type ToastVariant = "success" | "error" | "info";

interface ToastState {
  open: boolean;
  message: string;
  variant: ToastVariant;
  duration: number;
  show: (message: string, variant?: ToastVariant, duration?: number) => void;
  hide: () => void;
}

const useToastStore = create<ToastState>((set) => ({
  open: false,
  message: "",
  variant: "success",
  duration: 2500,
  show: (message, variant = "success", duration = 2500) =>
    set({ open: true, message, variant, duration }),
  hide: () => set({ open: false }),
}));

/** Imperative API. Called from anywhere — no hook needed. */
export function toast(message: string, variant: ToastVariant = "success", duration = 2500): void {
  if (variant === "success") hapticSuccess();
  else if (variant === "error") hapticWarning();
  useToastStore.getState().show(message, variant, duration);
}

/** Mount once at the top of App.tsx, alongside <ConfirmDialogHost/>. */
export function ToastHost() {
  const { open, message, variant, duration, hide } = useToastStore();

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(hide, duration);
    return () => clearTimeout(timer);
  }, [open, duration, hide]);

  if (!open) return null;

  return (
    <div
      // Bottom-center, above the mobile safe area. z-[10000] beats
      // every other overlay in the app including modals (z-901) so
      // save confirmations on top of a modal still read cleanly.
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[10000] flex justify-center px-4"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <output
        className={cn(
          "pointer-events-auto inline-flex max-w-[90vw] items-center gap-2 rounded-pill px-5 py-3 text-[13px] font-semibold shadow-md animate-fade-in",
          variant === "success" && "bg-green text-white",
          variant === "error" && "bg-red text-white",
          variant === "info" && "bg-ink text-white",
        )}
      >
        {variant === "success" && (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {variant === "error" && (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        )}
        <span>{message}</span>
      </output>
    </div>
  );
}
