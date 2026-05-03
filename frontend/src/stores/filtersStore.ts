import type { DateConfig } from "@/lib/datePicker";
import { create } from "zustand";

/**
 * Filters store — tracks the date-picker config and "show only with
 * spend" toggle for each view.
 *
 * Date design: as of 2026-05, the five "live FB metrics" views
 * (dashboard / analytics / alerts / finance / storeExpenses) share
 * a single `date.shared` slot. Operators almost always look at the
 * same time window across these tabs ("how did 本月 do?"); having
 * each tab carry its own date meant switching tabs blew the React
 * Query cache (different `date` → different query key → fresh
 * fetch + spinner). Sharing the slot lets RQ's 5-minute staleTime
 * actually hold across navigation.
 *
 * `optimization` (AI 幕僚) keeps its own slot — that view
 * snapshots a moment in time, so coupling it to live-metric date
 * changes would be confusing.
 *
 * Persisted key:
 *   filterActiveOnly → `filter_active_only` (boolean, default true)
 *
 * Date configs are NOT persisted; they reset on page refresh. The
 * default preset is `this_month` so users land on the current month
 * when they open any view.
 */

export type ViewKey = "shared" | "optimization";

const defaultDate = (): DateConfig => ({ preset: "this_month", from: null, to: null });

export interface FiltersState {
  /** Dashboard "只顯示有花費" toggle. */
  activeOnly: boolean;
  /** Per-view date configs. See module doc for the slot layout. */
  date: Record<ViewKey, DateConfig>;

  setActiveOnly: (v: boolean) => void;
  setDate: (view: ViewKey, config: DateConfig) => void;
}

export const useFiltersStore = create<FiltersState>((set) => ({
  activeOnly: true,
  date: {
    shared: defaultDate(),
    optimization: defaultDate(),
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
