/**
 * Barrel export for all Zustand stores + hydration helpers.
 * Call hydrateAllStores() once at app startup — before any React
 * component reads store state — so localStorage values are present
 * on the first render and avoid a flash of empty state.
 */

import {
  hydrateAccountsFromStorage,
  installAccountsStorageSync,
  useAccountsStore,
} from "./accountsStore";
import {
  hydrateFiltersFromStorage,
  installFiltersStorageSync,
  useFiltersStore,
} from "./filtersStore";
import {
  hydrateFinanceFromStorage,
  installFinanceStorageSync,
  useFinanceStore,
} from "./financeStore";
import { useUiStore } from "./uiStore";

export { useAccountsStore, useFiltersStore, useFinanceStore, useUiStore };

/** One-shot store hydration — call before `createRoot().render()`. */
export function hydrateAllStores(): void {
  hydrateAccountsFromStorage();
  hydrateFiltersFromStorage();
  hydrateFinanceFromStorage();
}

/** Wire store → legacy-localStorage-keys. Returns a combined unsubscribe.
 * Call once after hydrate, typically at app startup. */
export function installStorageSync(): () => void {
  const offAccounts = installAccountsStorageSync();
  const offFilters = installFiltersStorageSync();
  const offFinance = installFinanceStorageSync();
  return () => {
    offAccounts();
    offFilters();
    offFinance();
  };
}
