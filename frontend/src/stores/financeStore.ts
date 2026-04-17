import { create } from "zustand";

/**
 * Finance store — per-row markup overrides, pinned ids, default markup.
 *
 * Legacy mappings (all three are persisted localStorage keys):
 *   finRowMarkups → rowMarkups, key `fin_row_markups`
 *     { [campaignId]: markupPercent }
 *   finPinnedIds  → pinnedIds, key `fin_pinned_ids`
 *     (string[] of campaign ids pinned to top)
 *   (input#financeMarkupDefault) → defaultMarkup, key `fin_default_markup`
 *     (number, default 5)
 */

export interface FinanceState {
  rowMarkups: Record<string, number>;
  pinnedIds: string[];
  defaultMarkup: number;
  showNicknames: boolean;

  setRowMarkup: (campaignId: string, percent: number) => void;
  togglePin: (campaignId: string) => void;
  setDefaultMarkup: (v: number) => void;
  setShowNicknames: (v: boolean) => void;
}

export const useFinanceStore = create<FinanceState>((set) => ({
  rowMarkups: {},
  pinnedIds: [],
  defaultMarkup: 5,
  showNicknames: true,

  setRowMarkup: (campaignId, percent) =>
    set((state) => ({
      rowMarkups: { ...state.rowMarkups, [campaignId]: percent },
    })),

  togglePin: (campaignId) =>
    set((state) => {
      const idx = state.pinnedIds.indexOf(campaignId);
      if (idx === -1) return { pinnedIds: [...state.pinnedIds, campaignId] };
      const next = state.pinnedIds.slice();
      next.splice(idx, 1);
      return { pinnedIds: next };
    }),

  setDefaultMarkup: (v) => set({ defaultMarkup: v }),
  setShowNicknames: (v) => set({ showNicknames: v }),
}));

const K = {
  rowMarkups: "fin_row_markups",
  pinnedIds: "fin_pinned_ids",
  defaultMarkup: "fin_default_markup",
  showNicknames: "fin_show_nicknames",
} as const;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function hydrateFinanceFromStorage(): void {
  const rowMarkups = readJson<Record<string, number>>(K.rowMarkups, {});
  const pinnedIds = readJson<string[]>(K.pinnedIds, []);
  let defaultMarkup = 5;
  try {
    const raw = localStorage.getItem(K.defaultMarkup);
    if (raw !== null) {
      const parsed = Number(raw);
      if (!Number.isNaN(parsed)) defaultMarkup = parsed;
    }
  } catch {
    /* keep default */
  }
  let showNicknames = true;
  try {
    const raw = localStorage.getItem(K.showNicknames);
    if (raw !== null) showNicknames = raw === "1";
  } catch {
    /* keep default */
  }
  useFinanceStore.setState({
    rowMarkups: typeof rowMarkups === "object" && rowMarkups !== null ? rowMarkups : {},
    pinnedIds: Array.isArray(pinnedIds) ? pinnedIds : [],
    defaultMarkup,
    showNicknames,
  });
}

export function installFinanceStorageSync(): () => void {
  return useFinanceStore.subscribe((state, prev) => {
    if (state.rowMarkups !== prev.rowMarkups) {
      try {
        localStorage.setItem(K.rowMarkups, JSON.stringify(state.rowMarkups));
      } catch {
        /* quota */
      }
    }
    if (state.pinnedIds !== prev.pinnedIds) {
      try {
        localStorage.setItem(K.pinnedIds, JSON.stringify(state.pinnedIds));
      } catch {
        /* quota */
      }
    }
    if (state.defaultMarkup !== prev.defaultMarkup) {
      try {
        localStorage.setItem(K.defaultMarkup, String(state.defaultMarkup));
      } catch {
        /* quota */
      }
    }
    if (state.showNicknames !== prev.showNicknames) {
      try {
        localStorage.setItem(K.showNicknames, state.showNicknames ? "1" : "0");
      } catch {
        /* quota */
      }
    }
  });
}
