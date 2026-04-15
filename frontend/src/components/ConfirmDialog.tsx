import { create } from "zustand";
import { Button } from "./Button";
import { Modal } from "./Modal";

/**
 * Global confirm dialog — replaces the `showConfirm()` helper in
 * dashboard.html. CLAUDE.md mandates that any status toggle or budget
 * change MUST go through a confirm dialog before firing the API call.
 *
 * Usage:
 *   import { confirm } from "@/components/ConfirmDialog";
 *   if (await confirm("確定要關閉此行銷活動？")) { ... }
 *
 * The dialog renders at the root of the app via <ConfirmDialogHost/>
 * (mounted once in App.tsx). This keeps call sites ergonomic — no
 * need to manage local `open` state just to ask a yes/no question.
 */

interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  icon: string;
  resolve: ((value: boolean) => void) | null;
  ask: (msg: string, opts?: { title?: string; icon?: string }) => Promise<boolean>;
  _close: (result: boolean) => void;
}

const useConfirm = create<ConfirmState>((set, get) => ({
  open: false,
  title: "確認操作",
  message: "",
  icon: "⚠️",
  resolve: null,
  ask: (message, opts = {}) =>
    new Promise<boolean>((resolve) => {
      set({
        open: true,
        message,
        title: opts.title ?? "確認操作",
        icon: opts.icon ?? "⚠️",
        resolve,
      });
    }),
  _close: (result) => {
    const { resolve } = get();
    if (resolve) resolve(result);
    set({ open: false, resolve: null });
  },
}));

/** Imperative API — matches the legacy `showConfirm` signature but
 * returns a Promise instead of using a callback. */
export function confirm(
  message: string,
  opts?: { title?: string; icon?: string },
): Promise<boolean> {
  return useConfirm.getState().ask(message, opts);
}

/** Mount this once at the top of App.tsx.
 *
 * Design note — we deliberately DON'T pass the title through Modal's
 * `title` prop. If we did, the title would render in the sticky
 * header row (left-aligned, next to the X close button), and the
 * body content below (icon / message / buttons — all centered)
 * would look asymmetric. Instead we render the title as a centered
 * heading INSIDE the body column so everything aligns on the same
 * vertical axis. Modal's header still carries the X close button
 * in the top-right, which is fine — the empty flex-1 space to its
 * left visually balances the centered body content.
 */
export function ConfirmDialogHost() {
  const { open, title, message, icon, _close } = useConfirm();
  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) _close(false);
      }}
      width={320}
    >
      <div className="flex flex-col items-center text-center">
        <h3 className="mb-3 text-[15px] font-bold text-ink md:text-base">{title}</h3>
        <div className="mb-4 text-2xl">{icon}</div>
        <p className="mb-5 text-[13px] leading-relaxed text-gray-500">{message}</p>
        <div className="flex gap-2.5">
          <Button variant="ghost" size="sm" className="min-w-20" onClick={() => _close(false)}>
            取消
          </Button>
          <Button variant="primary" size="sm" className="min-w-20" onClick={() => _close(true)}>
            確定
          </Button>
        </div>
      </div>
    </Modal>
  );
}
