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
  /** Extra content rendered in the sticky header row, between the
   * title column and the X close button. Typically used for a
   * call-to-action that belongs to the entire modal (e.g. the
   * creative preview modal's "view original post" link). */
  titleAction?: ReactNode;
  /** When true, omit the X close button AND the entire sticky
   * header row (assuming there's also no title / subtitle / action).
   * Used by the centered confirmation dialog so the body content
   * is visually balanced top-to-bottom — having an X close at the
   * top would push everything downward.  Backdrop tap and Esc
   * still close the dialog. */
  hideClose?: boolean;
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
  titleAction,
  hideClose,
  children,
  footer,
  width = 360,
  className,
}: ModalProps) {
  // Skip the entire sticky header row when there's nothing to show
  // in it. Radix still requires a Dialog.Title for a11y, so we
  // render one in sr-only form alongside the body.
  const showHeader = title || subtitle || titleAction || !hideClose;
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
          {/* Radix Dialog REQUIRES Dialog.Title and Dialog.Description
              for a11y, even when we don't render them visibly. The
              sr-only fallbacks here keep screen-reader announcements
              correct in both header-on and header-hidden modes. */}
          {!showHeader && (
            <>
              <Dialog.Title className="sr-only">對話視窗</Dialog.Title>
              <Dialog.Description className="sr-only">對話視窗</Dialog.Description>
            </>
          )}
          {/* Sticky header — title on the left, optional title-action
              + close X on the right. Stays pinned to the top of the
              scrollable area when body content is taller than the
              viewport. Skipped entirely when `hideClose` is set and
              there's no title / subtitle / action to render — this
              is what the centered ConfirmDialog uses so the body
              content is balanced top-to-bottom. */}
          {showHeader && (
            <div className="sticky top-0 z-10 flex items-center gap-2 bg-white px-5 pt-5 md:px-6 md:pt-6">
              <div className="min-w-0 flex-1">
                {title ? (
                  <Dialog.Title className="mb-1 text-[15px] font-bold text-ink md:text-base">
                    {title}
                  </Dialog.Title>
                ) : (
                  <Dialog.Title className="sr-only">對話視窗</Dialog.Title>
                )}
                {subtitle ? (
                  <Dialog.Description className="text-xs text-gray-500">
                    {subtitle}
                  </Dialog.Description>
                ) : (
                  <Dialog.Description className="sr-only">{title ?? "對話視窗"}</Dialog.Description>
                )}
              </div>
              {titleAction && <div className="shrink-0">{titleAction}</div>}
              {!hideClose && (
                <Dialog.Close
                  aria-label="關閉"
                  className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-bg hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 md:-mr-3"
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
              )}
            </div>
          )}
          <div
            className={cn(
              "px-5 pb-5 md:px-6 md:pb-6",
              // When the header is rendered, the body sits below it
              // and only needs a small top gap. When the header is
              // hidden, the body uses the full top padding so the
              // first row of content has equal breathing room top
              // and bottom.
              showHeader ? "pt-4" : "pt-5 md:pt-6",
            )}
          >
            {children}
            {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
