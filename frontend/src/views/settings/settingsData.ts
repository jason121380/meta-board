import type { FbAccount } from "@/types/fb";

/**
 * Group accounts by Facebook Business Manager. Accounts without a
 * business fall into a special "__other__" group labelled "其他".
 *
 * Ported from the original design `getBmGroups()` lines 2308–2323.
 */

export interface BmGroup {
  key: string;
  name: string;
  accounts: FbAccount[];
}

const OTHER_KEY = "__other__";

export function groupAccountsByBusiness(accounts: FbAccount[]): BmGroup[] {
  const map = new Map<string, BmGroup>();
  for (const acc of accounts) {
    const key = acc.business?.id ?? OTHER_KEY;
    const name = acc.business?.name ?? "其他";
    let group = map.get(key);
    if (!group) {
      group = { key, name, accounts: [] };
      map.set(key, group);
    }
    group.accounts.push(acc);
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.key === OTHER_KEY) return 1;
    if (b.key === OTHER_KEY) return -1;
    return a.name.localeCompare(b.name, "zh-TW");
  });
}

/**
 * Count how many accounts in a group are currently checked.
 * Ports the inline `checkedCount` computation at the original design
 * lines 2319–2320.
 */
export function countChecked(group: BmGroup, checkedIds: Set<string>): number {
  return group.accounts.reduce((n, a) => n + (checkedIds.has(a.id) ? 1 : 0), 0);
}

/**
 * Apply a custom drag-sort order to a list of accounts: ids that
 * appear in `order` come first (in that order), remaining accounts
 * fall back to alphabetical by name. Matches the ordering used
 * across the dashboard (renderSettingsAcctList sort + getVisibleAccounts).
 */
export function sortAccountsByOrder(accounts: FbAccount[], order: string[]): FbAccount[] {
  return [...accounts].sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.name.localeCompare(b.name, "zh-TW");
  });
}

/**
 * Move `movingId` to immediately BEFORE `targetId` within an order
 * array. Returns a new array. If either id is missing it's added
 * in place. Used by the settings drag-and-drop handler.
 */
export function reorderByDrop(order: string[], movingId: string, targetId: string): string[] {
  if (movingId === targetId) return order;
  const without = order.filter((id) => id !== movingId);
  const targetIdx = without.indexOf(targetId);
  if (targetIdx < 0) {
    // target not yet in the order list — append both
    return [...without, movingId];
  }
  return [...without.slice(0, targetIdx), movingId, ...without.slice(targetIdx)];
}
