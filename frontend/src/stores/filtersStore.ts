import type { DateConfig } from "@/lib/datePicker";
import { create } from "zustand";

/**
 * Filters store — tracks the date-picker config and "show only with
 * spend" toggle for each view. Each view has its own config so
 * switching views doesn't stomp on the others' dates.
 *
 * Persisted key:
 *   filterActiveOnly → `filter_active_only` (boolean, default true)
 *
 * Date configs are NOT persisted; they reset on page refresh. The
 * default preset is `this_month` so users land on the current month
 * when they open any view.
 */

export type ViewKey = "dashboard" | "analytics" | "alerts" | "finance";

const defaultDate = (): DateConfig => ({ preset: "this_month", from: null, to: null });

export interface FiltersState {
  /** Dashboard "只顯示有花費" toggle. */
  activeOnly: boolean;
  /** Per-view date configs. */
  date: Record<ViewKey, DateConfig>;

  setActiveOnly: (v: boolean) => void;
  setDate: (view: ViewKey, config: DateConfig) => void;
}

export const useFiltersStore = create<FiltersState>((set) => ({
  activeOnly: true,
  date: {
    dashboard: defaultDate(),
    analytics: defaultDate(),
    alerts: defaultDate(),
    finance: defaultDate(),
  },
  setActiveOnly: (v) => set({ activeOnly: v }),
  setDate: (view, config) => set((state) => ({ date: { ...state.date, [view]: config } })),
}));

const K = { activeOnly: "filter_active_only" } as const;

/** Hydrate from the legacy `filter_active_only` key. Default is true
 * — matches legacy the original design line 1236. */
export function hydrateFiltersFromStorage(): void {
  try {
    const raw = localStorage.getItem(K.activeOnly);
    // Anything other than the literal string "false" is truthy.
    const value = raw !== "false";
    useFiltersStore.setState({ activeOnly: value });
  } catch {
    /* keep default */
  }
}

export function installFiltersStorageSync(): () => void {
  return useFiltersStore.subscribe((state, prev) => {
    if (state.activeOnly !== prev.activeOnly) {
      try {
        localStorage.setItem(K.activeOnly, String(state.activeOnly));
      } catch {
        /* quota */
      }
    }
  });
}
