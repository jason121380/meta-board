import { create } from "zustand";

/**
 * UI store — ephemeral, non-persisted state for the dashboard tree
 * expansion, sort selections, etc.
 *
 * Legacy mappings (NOT persisted in localStorage, resets on refresh):
 *   expandedCamps    (line 1254) → expandedCamps
 *   expandedAdsets   (line 1255) → expandedAdsets
 *   treeSort         (line 1256) → treeSort
 *   alertSelectedAcctId        → alertSelectedAcctId
 *   finSelectedAcctIds         → finSelectedAcctIds
 *   finSort          (line 1268) → finSort
 */

export type SortDir = "asc" | "desc";

export interface TreeSort {
  key: string | null;
  dir: SortDir;
}

export interface UiState {
  // Dashboard tree expansion state. Using arrays (not Sets) so Zustand
  // shallow-equality comparisons still work predictably — calling
  // toggleCamp returns a new array reference.
  expandedCamps: string[];
  expandedAdsets: string[];
  treeSort: TreeSort;

  // Alert view: single selected account id, or null for "all accounts".
  alertSelectedAcctId: string | null;

  // Finance view: list of selected account ids (empty = all).
  finSelectedAcctIds: string[];
  finSort: TreeSort;

  /** Whether the desktop account sidebar (dashboard / alerts /
   * finance) is collapsed. Shared across all 3 views so toggling on
   * one view applies everywhere — keeps the layout consistent. */
  acctSidebarCollapsed: boolean;

  toggleCamp: (id: string) => void;
  toggleAdset: (id: string) => void;
  setExpandedCamps: (ids: string[]) => void;
  setExpandedAdsets: (ids: string[]) => void;
  setTreeSort: (key: string | null, dir?: SortDir) => void;

  setAlertSelectedAcctId: (id: string | null) => void;

  setFinSelectedAcctIds: (ids: string[]) => void;
  setFinSort: (key: string | null, dir?: SortDir) => void;

  toggleAcctSidebar: () => void;
  setAcctSidebarCollapsed: (v: boolean) => void;

  /** Reset all ephemeral state — used on logout. */
  reset: () => void;
}

const initial = {
  expandedCamps: [] as string[],
  expandedAdsets: [] as string[],
  treeSort: { key: null, dir: "desc" as SortDir },
  alertSelectedAcctId: null as string | null,
  finSelectedAcctIds: [] as string[],
  finSort: { key: null, dir: "desc" as SortDir },
  acctSidebarCollapsed: false,
};

export const useUiStore = create<UiState>((set) => ({
  ...initial,

  toggleCamp: (id) =>
    set((state) => {
      const idx = state.expandedCamps.indexOf(id);
      if (idx === -1) return { expandedCamps: [...state.expandedCamps, id] };
      const next = state.expandedCamps.slice();
      next.splice(idx, 1);
      return { expandedCamps: next };
    }),

  toggleAdset: (id) =>
    set((state) => {
      const idx = state.expandedAdsets.indexOf(id);
      if (idx === -1) return { expandedAdsets: [...state.expandedAdsets, id] };
      const next = state.expandedAdsets.slice();
      next.splice(idx, 1);
      return { expandedAdsets: next };
    }),

  setExpandedCamps: (ids) => set({ expandedCamps: ids }),
  setExpandedAdsets: (ids) => set({ expandedAdsets: ids }),

  setTreeSort: (key, dir) =>
    set((state) => ({
      treeSort: {
        key,
        dir: dir ?? (state.treeSort.key === key && state.treeSort.dir === "desc" ? "asc" : "desc"),
      },
    })),

  setAlertSelectedAcctId: (id) => set({ alertSelectedAcctId: id }),

  setFinSelectedAcctIds: (ids) => set({ finSelectedAcctIds: ids }),
  setFinSort: (key, dir) =>
    set((state) => ({
      finSort: {
        key,
        dir: dir ?? (state.finSort.key === key && state.finSort.dir === "desc" ? "asc" : "desc"),
      },
    })),

  toggleAcctSidebar: () => set((state) => ({ acctSidebarCollapsed: !state.acctSidebarCollapsed })),
  setAcctSidebarCollapsed: (v) => set({ acctSidebarCollapsed: v }),

  reset: () => set(initial),
}));

const K_SIDEBAR_COLLAPSED = "ui_acct_sidebar_collapsed";

/** Hydrate the persisted UI bits (sidebar collapse) from localStorage. */
export function hydrateUiFromStorage(): void {
  try {
    const raw = localStorage.getItem(K_SIDEBAR_COLLAPSED);
    if (raw === "true") {
      useUiStore.setState({ acctSidebarCollapsed: true });
    }
  } catch {
    /* keep default */
  }
}

/** Subscribe to acctSidebarCollapsed and mirror to localStorage. */
export function installUiStorageSync(): () => void {
  return useUiStore.subscribe((state, prev) => {
    if (state.acctSidebarCollapsed !== prev.acctSidebarCollapsed) {
      try {
        localStorage.setItem(K_SIDEBAR_COLLAPSED, String(state.acctSidebarCollapsed));
      } catch {
        /* quota */
      }
    }
  });
}
