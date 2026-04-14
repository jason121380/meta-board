import { beforeEach, describe, expect, it } from "vitest";
import {
  hydrateAccountsFromStorage,
  installAccountsStorageSync,
  useAccountsStore,
} from "@/stores/accountsStore";
import {
  hydrateFiltersFromStorage,
  installFiltersStorageSync,
  useFiltersStore,
} from "@/stores/filtersStore";
import {
  hydrateFinanceFromStorage,
  installFinanceStorageSync,
  useFinanceStore,
} from "@/stores/financeStore";
import type { FbAccount } from "@/types/fb";

const resetStores = () => {
  useAccountsStore.setState({ selectedIds: [], activeIds: [], order: [] });
  useFiltersStore.setState({
    activeOnly: true,
    date: {
      dashboard: { preset: "this_month", from: null, to: null },
      analytics: { preset: "this_month", from: null, to: null },
      alerts: { preset: "this_month", from: null, to: null },
      finance: { preset: "this_month", from: null, to: null },
    },
  });
  useFinanceStore.setState({ rowMarkups: {}, pinnedIds: [], defaultMarkup: 5 });
};

beforeEach(() => {
  localStorage.clear();
  resetStores();
});

describe("accountsStore — localStorage bridge", () => {
  it("hydrates selectedIds / activeIds / order from the 3 legacy keys", () => {
    localStorage.setItem("fb_selected_accounts", JSON.stringify(["act_1", "act_2"]));
    localStorage.setItem("fb_active_accounts", JSON.stringify(["act_1"]));
    localStorage.setItem("acct_order", JSON.stringify(["act_2", "act_1"]));
    hydrateAccountsFromStorage();
    const s = useAccountsStore.getState();
    expect(s.selectedIds).toEqual(["act_1", "act_2"]);
    expect(s.activeIds).toEqual(["act_1"]);
    expect(s.order).toEqual(["act_2", "act_1"]);
  });

  it("ignores corrupt JSON and falls back to empty", () => {
    localStorage.setItem("fb_selected_accounts", "not-valid-json{");
    hydrateAccountsFromStorage();
    expect(useAccountsStore.getState().selectedIds).toEqual([]);
  });

  it("writes back to the same 3 keys when state changes", () => {
    const off = installAccountsStorageSync();
    useAccountsStore.getState().setSelectedIds(["act_5"]);
    useAccountsStore.getState().setActiveIds(["act_5"]);
    useAccountsStore.getState().setOrder(["act_5"]);
    expect(localStorage.getItem("fb_selected_accounts")).toBe('["act_5"]');
    expect(localStorage.getItem("fb_active_accounts")).toBe('["act_5"]');
    expect(localStorage.getItem("acct_order")).toBe('["act_5"]');
    off();
  });

  it("visibleAccounts respects custom order then falls back to alpha", () => {
    const all: FbAccount[] = [
      { id: "act_1", name: "Zebra", account_status: 1 },
      { id: "act_2", name: "Apple", account_status: 1 },
      { id: "act_3", name: "Mango", account_status: 1 },
    ];
    useAccountsStore.setState({ selectedIds: ["act_1", "act_2", "act_3"], order: ["act_3"] });
    const visible = useAccountsStore.getState().visibleAccounts(all);
    // act_3 first (explicit order), then Apple + Zebra alphabetically.
    expect(visible.map((a) => a.id)).toEqual(["act_3", "act_2", "act_1"]);
  });

  it("returns empty visibleAccounts when no ids are selected", () => {
    const all: FbAccount[] = [{ id: "act_1", name: "X", account_status: 1 }];
    expect(useAccountsStore.getState().visibleAccounts(all)).toEqual([]);
  });
});

describe("filtersStore — localStorage bridge", () => {
  it("hydrates activeOnly as true by default", () => {
    hydrateFiltersFromStorage();
    expect(useFiltersStore.getState().activeOnly).toBe(true);
  });
  it("hydrates activeOnly as false when the raw value is 'false'", () => {
    localStorage.setItem("filter_active_only", "false");
    hydrateFiltersFromStorage();
    expect(useFiltersStore.getState().activeOnly).toBe(false);
  });
  it("any other raw value is truthy (matches legacy behavior)", () => {
    localStorage.setItem("filter_active_only", "true");
    hydrateFiltersFromStorage();
    expect(useFiltersStore.getState().activeOnly).toBe(true);
  });
  it("writes back the boolean as a string", () => {
    const off = installFiltersStorageSync();
    useFiltersStore.getState().setActiveOnly(false);
    expect(localStorage.getItem("filter_active_only")).toBe("false");
    off();
  });
});

describe("financeStore — localStorage bridge", () => {
  it("hydrates rowMarkups / pinnedIds / defaultMarkup from 3 legacy keys", () => {
    localStorage.setItem("fin_row_markups", JSON.stringify({ cmp_1: 7.5 }));
    localStorage.setItem("fin_pinned_ids", JSON.stringify(["cmp_2"]));
    localStorage.setItem("fin_default_markup", "10");
    hydrateFinanceFromStorage();
    const s = useFinanceStore.getState();
    expect(s.rowMarkups).toEqual({ cmp_1: 7.5 });
    expect(s.pinnedIds).toEqual(["cmp_2"]);
    expect(s.defaultMarkup).toBe(10);
  });
  it("defaults to 5% markup when key missing", () => {
    hydrateFinanceFromStorage();
    expect(useFinanceStore.getState().defaultMarkup).toBe(5);
  });
  it("togglePin adds then removes an id", () => {
    useFinanceStore.getState().togglePin("cmp_1");
    expect(useFinanceStore.getState().pinnedIds).toEqual(["cmp_1"]);
    useFinanceStore.getState().togglePin("cmp_1");
    expect(useFinanceStore.getState().pinnedIds).toEqual([]);
  });
  it("setRowMarkup persists per-row percentage", () => {
    const off = installFinanceStorageSync();
    useFinanceStore.getState().setRowMarkup("cmp_9", 12.5);
    const stored = JSON.parse(localStorage.getItem("fin_row_markups") || "{}");
    expect(stored.cmp_9).toBe(12.5);
    off();
  });
});
