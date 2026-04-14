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
          //
          // Padding is applied to inner sections instead of the Content
          // root so the sticky close header can bleed to the edges and
          // still sit on top of scrolled body content.
          className={cn(
            "fixed inset-0 z-[901] m-auto h-fit",
            "overflow-y-auto rounded-2xl bg-white p-0 shadow-md",
            "focus:outline-none animate-fade-in",
            className,
          )}
        >
          {/* Sticky header — title on the left, always-visible close X
              on the right. Stays pinned to the top of the scrollable
              area when body content is taller than the viewport, so
              the X never scrolls away. Without this, tall preview
              modals (e.g. 3rd-level ad creative with long body text)
              trapped mobile users because the backdrop-tap gesture
              isn't obvious and there was no reachable close. */}
          <div className="sticky top-0 z-10 flex items-start gap-2 bg-white px-5 pt-5 md:px-6 md:pt-6">
            <div className="min-w-0 flex-1">
              {title && (
                <Dialog.Title className="mb-1 text-[15px] font-bold text-ink md:text-base">
                  {title}
                </Dialog.Title>
              )}
              {/* Always render a Description so Radix's a11y warning
                  stays quiet. When no subtitle is supplied, the
                  description is sr-only and just echoes the title
                  for screen readers. */}
              {subtitle ? (
                <Dialog.Description className="text-xs text-gray-500">
                  {subtitle}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title ?? "對話視窗"}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="關閉"
              className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-bg hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 md:-mr-3"
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
          </div>
          <div className="px-5 pb-5 pt-4 md:px-6 md:pb-6">
            {children}
            {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
