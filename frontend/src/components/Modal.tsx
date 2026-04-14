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
          style={{ width, maxWidth: "calc(100vw - 24px)" }}
          className={cn(
            "fixed left-1/2 top-1/2 z-[901] -translate-x-1/2 -translate-y-1/2",
            "max-h-[calc(100vh-48px)] overflow-y-auto",
            "rounded-2xl bg-white p-5 shadow-md md:p-6",
            "focus:outline-none animate-fade-in",
            className,
          )}
        >
          {title && (
            <Dialog.Title className="mb-1 text-[15px] font-bold text-ink md:text-base">
              {title}
            </Dialog.Title>
          )}
          {/* Always render a Description so Radix's a11y warning
              stays quiet. When no subtitle is supplied, the
              description is sr-only and just echoes the title for
              screen readers. */}
          {subtitle ? (
            <Dialog.Description className="mb-4 text-xs text-gray-500">
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
