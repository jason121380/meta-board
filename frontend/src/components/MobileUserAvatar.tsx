import { useFbAuth } from "@/auth/FbAuthProvider";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

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
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const initial = (user.name?.[0] ?? "?").toUpperCase();

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
            onClick={() => {
              setOpen(false);
              navigate("/engineering");
            }}
            className="w-full justify-center"
          >
            工程模式
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
