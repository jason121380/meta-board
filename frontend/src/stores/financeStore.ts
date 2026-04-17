import { api } from "@/api/client";
import { debounce } from "@/lib/debounce";
import { create } from "zustand";

/**
 * Finance store — row markup overrides, pinned ids, default markup,
 * show-nicknames toggle.
 *
 * Persistence (after the 2026-04-17 PG cutover):
 *   - rowMarkups    → shared setting `finance_row_markups`        (PG)
 *   - pinnedIds     → shared setting `finance_pinned_ids`         (PG)
 *   - defaultMarkup → shared setting `finance_default_markup`     (PG)
 *   - showNicknames → shared setting `finance_show_nicknames`     (PG)
 *
 * SettingsProvider seeds these from the server at startup. After that,
 * any mutation fires a debounced POST to persist team-wide. No more
 * localStorage for these fields.
 */

export interface FinanceState {
  rowMarkups: Record<string, number>;
  pinnedIds: string[];
  defaultMarkup: number;
  showNicknames: boolean;

  /** One-way seed from server — set by SettingsProvider on first load.
   * Does NOT trigger a POST back. */
  hydrateFromServer: (input: {
    rowMarkups: Record<string, number>;
    pinnedIds: string[];
    defaultMarkup: number;
    showNicknames: boolean;
  }) => void;

  setRowMarkup: (campaignId: string, percent: number) => void;
  togglePin: (campaignId: string) => void;
  setDefaultMarkup: (v: number) => void;
  setShowNicknames: (v: boolean) => void;
}

// Debounced writers. 500ms is forgiving enough for typed-input latency
// (markup %) without leaving data unpersisted for long if the user
// navigates away quickly.
const postRowMarkups = debounce((m: Record<string, number>) => {
  void api.settings.setShared("finance_row_markups", m);
}, 500);
const postPinnedIds = debounce((ids: string[]) => {
  void api.settings.setShared("finance_pinned_ids", ids);
}, 500);
const postDefaultMarkup = debounce((v: number) => {
  void api.settings.setShared("finance_default_markup", v);
}, 500);
const postShowNicknames = debounce((v: boolean) => {
  void api.settings.setShared("finance_show_nicknames", v);
}, 500);

export const useFinanceStore = create<FinanceState>((set) => ({
  rowMarkups: {},
  pinnedIds: [],
  defaultMarkup: 5,
  showNicknames: true,

  hydrateFromServer: ({ rowMarkups, pinnedIds, defaultMarkup, showNicknames }) =>
    set({ rowMarkups, pinnedIds, defaultMarkup, showNicknames }),

  setRowMarkup: (campaignId, percent) =>
    set((state) => {
      const next = { ...state.rowMarkups, [campaignId]: percent };
      postRowMarkups(next);
      return { rowMarkups: next };
    }),

  togglePin: (campaignId) =>
    set((state) => {
      const idx = state.pinnedIds.indexOf(campaignId);
      const next =
        idx === -1 ? [...state.pinnedIds, campaignId] : state.pinnedIds.filter((_, i) => i !== idx);
      postPinnedIds(next);
      return { pinnedIds: next };
    }),

  setDefaultMarkup: (v) => {
    set({ defaultMarkup: v });
    postDefaultMarkup(v);
  },
  setShowNicknames: (v) => {
    set({ showNicknames: v });
    postShowNicknames(v);
  },
}));

// Settings persistence lives in PostgreSQL now. These helpers remain
// as no-ops so the stores/index.ts barrel keeps its old API without
// every caller having to change.
export function hydrateFinanceFromStorage(): void {
  /* PG-backed; SettingsProvider does the real hydrate. */
}

export function installFinanceStorageSync(): () => void {
  return () => {
    /* no localStorage sync */
  };
}
