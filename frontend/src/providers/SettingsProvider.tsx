import { useSharedSettings, useUserSettings } from "@/api/hooks/useSettings";
import { useFbAuth } from "@/auth/FbAuthProvider";
import { LoadingState } from "@/components/LoadingState";
import { setAccountsUserId, useAccountsStore } from "@/stores/accountsStore";
import { useFinanceStore } from "@/stores/financeStore";
import { type ReactNode, useEffect, useState } from "react";

/**
 * SettingsProvider — PostgreSQL hydration gate.
 *
 * Mounted immediately inside AuthGate (i.e. after FB auth succeeds and
 * we have a user id). Fires two GETs in parallel:
 *   - /api/settings/user/{fb_user_id}   → per-user: selected accounts + order
 *   - /api/settings/shared              → shared: finance markups, pins, etc.
 *
 * Children only mount once both have resolved (or failed — empty data
 * is fine, the app just starts with defaults). This replaces the old
 * localStorage-only hydration path for those keys.
 *
 * The hydration is ONE-WAY: we seed the Zustand stores from server
 * data on first load. Subsequent mutations flow stores → API mutations
 * → server. Query cache is the source of truth, not the stores — but
 * Zustand keeps the synchronous snapshot needed by views that read
 * store state during render.
 *
 * ⚠️ `seeded` MUST be a useState, not useRef. A ref mutation doesn't
 * trigger a re-render, so the `loaded` check in render would stay
 * `false` forever after the effect ran, and the user would see the
 * loading screen indefinitely.
 */

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useFbAuth();
  const userId = user?.id ?? null;

  const userQuery = useUserSettings(userId);
  const sharedQuery = useSharedSettings();

  const [seeded, setSeeded] = useState(false);

  // Register the FB user id with the accounts store so its writer
  // knows which user to POST under. Cleared on logout.
  useEffect(() => {
    setAccountsUserId(userId);
    return () => setAccountsUserId(null);
  }, [userId]);

  useEffect(() => {
    if (seeded) return;
    if (!userQuery.isSuccess || !sharedQuery.isSuccess) return;

    const u = userQuery.data ?? {};
    const s = sharedQuery.data ?? {};

    // Per-user: selected_accounts, account_order
    const selectedIds = Array.isArray(u.selected_accounts)
      ? (u.selected_accounts as string[]).filter((v): v is string => typeof v === "string")
      : [];
    const order = Array.isArray(u.account_order)
      ? (u.account_order as string[]).filter((v): v is string => typeof v === "string")
      : [];
    useAccountsStore.getState().hydrateFromServer({ selectedIds, order });

    // Shared: finance_row_markups, finance_pinned_ids,
    // finance_default_markup, finance_show_nicknames
    const rowMarkups =
      s.finance_row_markups && typeof s.finance_row_markups === "object"
        ? (s.finance_row_markups as Record<string, number>)
        : {};
    const pinnedIds = Array.isArray(s.finance_pinned_ids)
      ? (s.finance_pinned_ids as string[]).filter((v): v is string => typeof v === "string")
      : [];
    const defaultMarkup =
      typeof s.finance_default_markup === "number" ? s.finance_default_markup : 5;
    const showNicknames =
      typeof s.finance_show_nicknames === "boolean" ? s.finance_show_nicknames : true;

    useFinanceStore.getState().hydrateFromServer({
      rowMarkups,
      pinnedIds,
      defaultMarkup,
      showNicknames,
    });

    setSeeded(true);
  }, [seeded, userQuery.isSuccess, sharedQuery.isSuccess, userQuery.data, sharedQuery.data]);

  const errored = userQuery.isError || sharedQuery.isError;
  // Render children as soon as EITHER seeding completes OR the queries
  // fail. Failing through to the app with default-empty state beats
  // being stuck on a loading spinner forever when the DB is offline.
  if (!seeded && !errored) {
    return <LoadingState title="載入設定中..." />;
  }

  return <>{children}</>;
}
