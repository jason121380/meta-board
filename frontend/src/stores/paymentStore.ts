import { api } from "@/api/client";
import { queryClient } from "@/lib/queryClient";
import { create } from "zustand";

/**
 * Payment-receiving accounts (收款帳戶) — bank account info used on
 * the Finance invoice (請款單) download. Multiple accounts can be
 * stored so different campaigns can bill different parties.
 *
 * Persistence: shared setting key `payment_accounts` in PostgreSQL
 * (JSONB array). Hydrated by SettingsProvider on app start; mutations
 * fire an immediate POST since these are click-driven (not typed).
 */

export interface PaymentAccount {
  id: string;
  /** 顯示用別名 — 例如「公司主帳戶」、「合作店家 A」。在請款單彈窗
   *  挑選收款帳戶時優先顯示;留空則 fallback 用銀行名稱。 */
  alias: string;
  bank: string;
  branch: string;
  holder: string;
  accountNo: string;
}

const invalidateSharedSettings = () => {
  queryClient.invalidateQueries({ queryKey: ["settings", "shared"] });
};

const postAccounts = (accounts: PaymentAccount[]) => {
  api.settings
    .setShared("payment_accounts", accounts)
    .then(invalidateSharedSettings)
    .catch(() => {});
};

export interface PaymentState {
  accounts: PaymentAccount[];

  hydrateFromServer: (accounts: PaymentAccount[]) => void;
  addAccount: (acc: Omit<PaymentAccount, "id">) => void;
  updateAccount: (id: string, patch: Partial<Omit<PaymentAccount, "id">>) => void;
  removeAccount: (id: string) => void;
}

export const usePaymentStore = create<PaymentState>((set) => ({
  accounts: [],

  hydrateFromServer: (accounts) => set({ accounts }),

  addAccount: (acc) =>
    set((state) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `pa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const next = [...state.accounts, { id, ...acc }];
      postAccounts(next);
      return { accounts: next };
    }),

  updateAccount: (id, patch) =>
    set((state) => {
      const next = state.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a));
      postAccounts(next);
      return { accounts: next };
    }),

  removeAccount: (id) =>
    set((state) => {
      const next = state.accounts.filter((a) => a.id !== id);
      postAccounts(next);
      return { accounts: next };
    }),
}));
