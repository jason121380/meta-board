import type { NicknameMap } from "@/api/hooks/useNicknames";
import { spendOf } from "@/lib/insights";
import type { FbCampaign } from "@/types/fb";
import { markupFor, spendPlus } from "@/views/finance/financeData";

/**
 * 店家花費 (Store Expenses) — aggregation by 店家 nickname.
 *
 * Each row groups all campaigns that share the same `store` value
 * from `campaign_nicknames`. Campaigns without a store nickname are
 * excluded (no place to put them — the view's whole purpose is to
 * answer "how much did each store spend?").
 *
 * 設計師 column lists every distinct designer working on that store's
 * campaigns (comma-separated). Empty designer values are skipped.
 */

export type StoreSortKey = "store" | "plus" | null;
export type StoreSortDir = "asc" | "desc";

export interface StoreSortState {
  key: StoreSortKey;
  dir: StoreSortDir;
}

export interface DesignerBreakdown {
  name: string;
  spendPlus: number;
}

export interface StoreRow {
  store: string;
  /** Per-designer breakdown of spend+%. Sorted by spendPlus desc so the
   *  biggest contributor reads first in the UI. Designers with empty
   *  names are bucketed under "—" so we don't drop their spend. */
  designers: DesignerBreakdown[];
  spend: number;
  spendPlus: number;
  campaignCount: number;
}

export function buildStoreRows(
  campaigns: FbCampaign[],
  nicknames: NicknameMap,
  rowMarkups: Record<string, number>,
  defaultMarkup: number,
): StoreRow[] {
  // Two-level aggregation: store → designer → spendPlus
  const stores = new Map<
    string,
    {
      store: string;
      designers: Map<string, number>;
      spend: number;
      spendPlus: number;
      campaignCount: number;
    }
  >();

  for (const camp of campaigns) {
    const nick = nicknames[camp.id];
    const store = (nick?.store ?? "").trim();
    // 沒設定店家 → 不算進此頁(此頁的目的就是看每個店家的花費)
    if (!store) continue;
    const designer = (nick?.designer ?? "").trim() || "—";
    const sp = spendOf(camp);
    const m = markupFor(camp.id, rowMarkups, defaultMarkup);
    const plus = spendPlus(sp, m);

    let bucket = stores.get(store);
    if (!bucket) {
      bucket = {
        store,
        designers: new Map<string, number>(),
        spend: 0,
        spendPlus: 0,
        campaignCount: 0,
      };
      stores.set(store, bucket);
    }
    bucket.spend += sp;
    bucket.spendPlus += plus;
    bucket.campaignCount += 1;
    bucket.designers.set(designer, (bucket.designers.get(designer) ?? 0) + plus);
  }

  return Array.from(stores.values()).map((b) => ({
    store: b.store,
    designers: Array.from(b.designers.entries())
      .map(([name, spendPlus]) => ({ name, spendPlus }))
      .sort((a, b) => b.spendPlus - a.spendPlus),
    spend: b.spend,
    spendPlus: b.spendPlus,
    campaignCount: b.campaignCount,
  }));
}

export function sortStoreRows(rows: StoreRow[], sort: StoreSortState): StoreRow[] {
  if (!sort.key) return rows;
  const compare = (a: StoreRow, b: StoreRow) => {
    if (sort.key === "store") {
      return a.store.localeCompare(b.store, "zh-Hant");
    }
    if (sort.key === "plus") {
      return a.spendPlus - b.spendPlus;
    }
    return 0;
  };
  const out = [...rows].sort(compare);
  return sort.dir === "asc" ? out : out.reverse();
}

export function filterStoreRows(rows: StoreRow[], search: string, hideZero: boolean): StoreRow[] {
  const q = search.trim().toLowerCase();
  return rows.filter((r) => {
    if (hideZero && r.spendPlus <= 0) return false;
    if (q) {
      const inStore = r.store.toLowerCase().includes(q);
      const inDesigner = r.designers.some((d) => d.name.toLowerCase().includes(q));
      if (!inStore && !inDesigner) return false;
    }
    return true;
  });
}
