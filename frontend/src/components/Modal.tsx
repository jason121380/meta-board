import { cn } from "@/lib/cn";
import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

/**
 * Modal — Radix Dialog primitive styled to match dashboard.html's
 * `.overlay` + `.modal` classes (white card, 12px radius, 24px padding,
 * 360px default width, md shadow, 900 z-index).
 *
 * Uses controlled `open` / `onOpenChange` API (shadcn-style). Content
 * is centered via fixed positioning. Clicking outside or pressing
 * Escape dismisses the dialog — matches current `overlay onclick`
 * behavior in dashboard.html.
 */

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number | string;
  className?: string;
}

export function Modal({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  footer,
  width = 360,
  className,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[900] bg-black/40 backdrop-blur-[1px] animate-fade-in" />
        <Dialog.Content
          style={{
            width,
            maxWidth: "calc(100vw - 24px)",
            maxHeight: "calc(100vh - 48px)",
          }}
          // Centering pattern: position fixed + inset:0 + margin:auto
          // distributes remaining space equally on every side, so the
          // dialog is perfectly centered regardless of any transformed
          // ancestors that would have broken `left-1/2 -translate-x-1/2`.
          // h-fit prevents the dialog from stretching to viewport height.
          className={cn(
            "fixed inset-0 z-[901] m-auto h-fit",
            "overflow-y-auto rounded-2xl bg-white p-5 shadow-md md:p-6",
            "focus:outline-none animate-fade-in",
            className,
          )}
        >
          {/* Always-present close affordance. Mobile users expect a
              tappable X in the top-right (Esc is hidden on touch).
              Positioned absolute + z-10 so it floats above the title
              and any children that bleed to the corner. */}
          <Dialog.Close
            aria-label="關閉"
            className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-bg hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 md:right-3 md:top-3"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </Dialog.Close>
          {title && (
            <Dialog.Title className="mb-1 pr-10 text-[15px] font-bold text-ink md:text-base">
              {title}
            </Dialog.Title>
          )}
          {/* Always render a Description so Radix's a11y warning
              stays quiet. When no subtitle is supplied, the
              description is sr-only and just echoes the title for
              screen readers. */}
          {subtitle ? (
            <Dialog.Description className="mb-4 pr-10 text-xs text-gray-500">
              {subtitle}
            </Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title ?? "對話視窗"}</Dialog.Description>
          )}
          {children}
          {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
