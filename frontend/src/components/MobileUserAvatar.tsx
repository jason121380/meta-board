import { useSharedSettings, useUserSettings } from "@/api/hooks/useSettings";
import { useFbAuth } from "@/auth/FbAuthProvider";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { useUiStore } from "@/stores/uiStore";
import { useState } from "react";

/**
 * Mobile-only avatar in the top-left of every Topbar.
 *
 * Replaces the desktop sidebar's user dropdown — on phones the
 * sidebar is hidden behind the bottom tab bar, so the user has no
 * other entry point to log out. Tapping opens a centered Modal with
 * a single 登出 action.
 *
 * Hidden on desktop (md:hidden).
 */
export function MobileUserAvatar() {
  const { user, logout } = useFbAuth();
  const settingsReady = useUiStore((s) => s.settingsReady);
  const userQuery = useUserSettings(user?.id ?? null);
  const sharedQuery = useSharedSettings();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const initial = (user.name?.[0] ?? "?").toUpperCase();
  const userKeys = Object.keys(userQuery.data ?? {});
  const sharedKeys = Object.keys(sharedQuery.data ?? {});

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`帳戶選單,${user.name ?? ""}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-orange-bg text-[12px] font-bold text-orange active:scale-95 md:hidden"
      >
        {user.pictureUrl ? (
          <img
            src={user.pictureUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          initial
        )}
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={user.name ?? "帳戶"}
        subtitle="Facebook 帳號"
        width={320}
      >
        <div className="flex flex-col gap-3">
          {/* Diagnostic strip — visible state of the current session.
              Helps the user (and us) quickly check why settings might
              not be loading without opening DevTools. */}
          <div className="rounded-lg border border-border bg-bg p-2.5 text-[11px] leading-relaxed text-gray-500">
            <div>
              FB id: <span className="font-mono text-ink">{user.id || "(空)"}</span>
            </div>
            <div>
              Settings ready:{" "}
              <span className={settingsReady ? "text-[#2E7D32]" : "text-orange"}>
                {settingsReady ? "yes" : "no"}
              </span>
            </div>
            <div>
              user_settings keys:{" "}
              <span className="font-mono text-ink">
                {userKeys.length > 0 ? userKeys.join(", ") : "(無)"}
              </span>
            </div>
            <div>
              shared_settings keys:{" "}
              <span className="font-mono text-ink">
                {sharedKeys.length > 0 ? sharedKeys.join(", ") : "(無)"}
              </span>
            </div>
            <a
              href="/api/_debug/settings"
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-block text-orange underline"
            >
              查看資料庫完整內容 →
            </a>
          </div>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className="w-full justify-center"
          >
            登出
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={() => setOpen(false)}
            className="w-full justify-center"
          >
            取消
          </Button>
        </div>
      </Modal>
    </>
  );
}
