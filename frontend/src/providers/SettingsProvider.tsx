import { useSharedSettings, useUserSettings } from "@/api/hooks/useSettings";
import { useFbAuth } from "@/auth/FbAuthProvider";
import { setAccountsUserId, useAccountsStore } from "@/stores/accountsStore";
import { useFinanceStore } from "@/stores/financeStore";
import { useUiStore } from "@/stores/uiStore";
import { type ReactNode, useEffect, useState } from "react";

/**
 * SettingsProvider — PostgreSQL hydration runner (not a gate).
 *
 * Mounted immediately inside AuthGate. Fires two GETs in parallel:
 *   - /api/settings/user/{fb_user_id}   → per-user: selected accounts + order
 *   - /api/settings/shared              → shared: finance markups, pins, etc.
 *
 * Hydrates the Zustand stores in a useEffect once both queries succeed
 * AND flips uiStore.settingsReady so views can suppress their own
 * "select an account" empty state during the brief loading window.
 *
 * Children render IMMEDIATELY — no loading screen here. The user's
 * perception is a single "load data" screen because each view's own
 * data-loading state covers the settings hydration window.
 */

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useFbAuth();
  const userId = user?.id ?? null;

  const userQuery = useUserSettings(userId);
  const sharedQuery = useSharedSettings();

  const [seeded, setSeeded] = useState(false);
  const setSettingsReady = useUiStore((s) => s.setSettingsReady);

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

    console.log("[settings] hydrate — fb uid=", userId);
    console.log("[settings] user settings from PG:", u);
    console.log("[settings] shared settings from PG:", s);

    const selectedIds = Array.isArray(u.selected_accounts)
      ? (u.selected_accounts as string[]).filter((v): v is string => typeof v === "string")
      : [];
    const order = Array.isArray(u.account_order)
      ? (u.account_order as string[]).filter((v): v is string => typeof v === "string")
      : [];
    useAccountsStore.getState().hydrateFromServer({ selectedIds, order });

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
    setSettingsReady(true);
  }, [
    seeded,
    userQuery.isSuccess,
    sharedQuery.isSuccess,
    userQuery.data,
    sharedQuery.data,
    setSettingsReady,
    userId,
  ]);

  // Failures shouldn't block the app either — flip ready so views
  // don't wait forever on a dead DB.
  useEffect(() => {
    if (userQuery.isError || sharedQuery.isError) {
      setSettingsReady(true);
    }
  }, [userQuery.isError, sharedQuery.isError, setSettingsReady]);

  return <>{children}</>;
}
