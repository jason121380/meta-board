import { useAccounts } from "@/api/hooks/useAccounts";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { useAccountsStore } from "@/stores/accountsStore";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * First-login guidance prompt. If the user has successfully loaded
 * the FB account list but their `selectedIds` (the "enabled in
 * Settings" set) is still empty — i.e. they've never picked which
 * ad accounts to show in the dashboard — we pop a dialog telling
 * them to head to Settings, with a button that takes them there.
 *
 * Mounted ONCE at the top of the authenticated tree, not per-view,
 * so it surfaces immediately after login regardless of which route
 * the router lands on.
 *
 * Dismissal is per-session only (module-level flag + local state);
 * the user should see this at most once per page load, not every
 * time they navigate back to /dashboard.
 *
 * The check is deferred by a short timeout so the cloud-settings
 * hydration from /api/settings/{userId} has a chance to populate
 * selectedIds from PostgreSQL BEFORE we decide the user is empty.
 * Without this delay, repeat visitors with their selection already
 * saved in DB would see the prompt for a split second every login.
 */

// Module-level so the prompt never re-shows after dismissal within
// the same page load. Survives route changes, resets on refresh.
let dismissedThisSession = false;

const CLOUD_HYDRATION_GRACE_MS = 1500;

export function EmptyAccountsPrompt() {
  const navigate = useNavigate();
  const accountsQuery = useAccounts();
  const selectedIds = useAccountsStore((s) => s.selectedIds);

  const [open, setOpen] = useState(false);
  // Grace-period flag flips true after CLOUD_HYDRATION_GRACE_MS so
  // we only start showing the prompt after the cloud hydration
  // has had a chance to write DB values into selectedIds.
  const [checkReady, setCheckReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setCheckReady(true), CLOUD_HYDRATION_GRACE_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (dismissedThisSession) return;
    if (!checkReady) return;
    if (!accountsQuery.isSuccess) return;
    const fbAccountCount = accountsQuery.data?.length ?? 0;
    if (fbAccountCount === 0) return; // user genuinely has no FB accounts — nothing to suggest
    if (selectedIds.length > 0) return; // user already has a selection → don't bother
    setOpen(true);
  }, [checkReady, accountsQuery.isSuccess, accountsQuery.data, selectedIds.length]);

  const goToSettings = () => {
    dismissedThisSession = true;
    setOpen(false);
    navigate("/settings");
  };

  const dismiss = () => {
    dismissedThisSession = true;
    setOpen(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
      width={360}
      title="尚未設定廣告帳戶"
    >
      <div className="mb-4 flex justify-center text-[32px]">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#FF6B2C"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          role="img"
          aria-label="警示圖示"
        >
          <title>警示</title>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v5" />
          <circle cx="12" cy="16.5" r="0.6" fill="#FF6B2C" />
        </svg>
      </div>
      <p className="mb-5 text-center text-[13px] leading-relaxed text-gray-500">
        你還沒有選擇要顯示的廣告帳戶。請先到「設定」頁面勾選要在儀表板中管理的帳戶。
      </p>
      <div className="flex justify-center gap-2.5">
        <Button variant="ghost" size="sm" className="min-w-20" onClick={dismiss}>
          稍後
        </Button>
        <Button variant="primary" size="sm" className="min-w-20" onClick={goToSettings}>
          前往設定
        </Button>
      </div>
    </Modal>
  );
}
