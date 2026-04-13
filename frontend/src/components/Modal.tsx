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
        <Dialog.Overlay className="fixed inset-0 z-[900] flex items-center justify-center bg-black/30 p-4" />
        <Dialog.Content
          style={{ width, maxWidth: "100%" }}
          className={cn(
            "fixed left-1/2 top-1/2 z-[901] -translate-x-1/2 -translate-y-1/2",
            "rounded-xl bg-white p-6 shadow-md",
            "focus:outline-none",
            className,
          )}
        >
          {title && (
            <Dialog.Title className="mb-1 text-base font-bold text-ink">{title}</Dialog.Title>
          )}
          {subtitle && (
            <Dialog.Description className="mb-4 text-xs text-gray-500">
              {subtitle}
            </Dialog.Description>
          )}
          {children}
          {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
