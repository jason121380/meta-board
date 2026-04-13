import type { FbAccount } from "@/types/fb";
import { create } from "zustand";

/**
 * Accounts store — tracks the user's saved/active/ordered account lists.
 *
 * Maps directly onto legacy dashboard.html global `let` state:
 *   savedSelectedIds (line 1235) → selectedIds, persisted as
 *     `fb_selected_accounts`
 *   selectedAccounts  (line 1234) → activeIds, persisted as
 *     `fb_active_accounts`  (single-select currently; kept as array
 *     because the legacy code modeled it that way and we don't want
 *     to break data shape for users with existing localStorage)
 *   acctOrder         (line 1237) → order, persisted as `acct_order`
 *
 * `allAccounts` (the raw FB response list) is NOT persisted; it lives
 * in TanStack Query cache and comes from useAccounts().
 */

export interface AccountsState {
  /** Set of account ids the user has enabled in Settings (and wants
   * visible in the Dashboard left panel). */
  selectedIds: string[];
  /** Set of account ids currently active in the dashboard view. */
  activeIds: string[];
  /** User-defined drag-sort order (subset of selectedIds + any others). */
  order: string[];

  setSelectedIds: (ids: string[]) => void;
  setActiveIds: (ids: string[]) => void;
  setOrder: (order: string[]) => void;

  /** Utility: return the user's visible accounts (selectedIds) sorted
   * by `order` first, then alphabetically by name. Matches the legacy
   * getVisibleAccounts() helper at dashboard.html line 1701. */
  visibleAccounts: (all: FbAccount[]) => FbAccount[];
}

export const useAccountsStore = create<AccountsState>((set, get) => ({
  selectedIds: [],
  activeIds: [],
  order: [],

  setSelectedIds: (ids) => set({ selectedIds: ids }),
  setActiveIds: (ids) => set({ activeIds: ids }),
  setOrder: (order) => set({ order }),

  visibleAccounts: (all) => {
    const { selectedIds, order } = get();
    if (selectedIds.length === 0) return [];
    const list = all.filter((a) => selectedIds.includes(a.id));
    return list.sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.name.localeCompare(b.name, "zh-TW");
    });
  },
}));

// ── Legacy localStorage key bridge ─────────────────────────────
// Zustand's `persist` middleware lumps everything into one key. We want
// to preserve the 7 legacy keys verbatim so existing users roll over
// without data loss. These helpers read/write each key individually.

const K = {
  selectedIds: "fb_selected_accounts",
  activeIds: "fb_active_accounts",
  order: "acct_order",
} as const;

function readArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeArray(key: string, value: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota errors */
  }
}

/** Call once at app startup, before any view reads the store. */
export function hydrateAccountsFromStorage(): void {
  useAccountsStore.setState({
    selectedIds: readArray(K.selectedIds),
    activeIds: readArray(K.activeIds),
    order: readArray(K.order),
  });
}

/** Subscribe store changes → write to the legacy localStorage keys. */
export function installAccountsStorageSync(): () => void {
  return useAccountsStore.subscribe((state, prev) => {
    if (state.selectedIds !== prev.selectedIds) writeArray(K.selectedIds, state.selectedIds);
    if (state.activeIds !== prev.activeIds) writeArray(K.activeIds, state.activeIds);
    if (state.order !== prev.order) writeArray(K.order, state.order);
  });
}
