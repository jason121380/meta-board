import { spendOf } from "@/lib/insights";
import type { FbAccount, FbCampaign, FbInsights } from "@/types/fb";

/**
 * Pure data helpers for the Finance view. No React, no DOM — all
 * functions take campaigns/insights/state as inputs so they're
 * fully unit-testable.
 *
 * Ported from dashboard.html `renderFinanceTable()` and
 * `renderFinanceAcctList()` lines 3260–3520.
 */

export type FinSortKey = "name" | "acct" | "spend" | "markup" | "plus" | null;
export type FinSortDir = "asc" | "desc";

export interface FinSortState {
  key: FinSortKey;
  dir: FinSortDir;
}

/** The markup for a campaign — either per-row override or default. */
export function markupFor(
  campaignId: string,
  rowMarkups: Record<string, number>,
  defaultMarkup: number,
): number {
  return rowMarkups[campaignId] !== undefined ? rowMarkups[campaignId] : defaultMarkup;
}

/** `spend * (1 + markup/100)`, ceiled to the nearest integer. */
export function spendPlus(spend: number, markup: number): number {
  return Math.ceil(spend * (1 + markup / 100));
}

/**
 * Account-level spend. Prefers the account-level insights value
 * (accurate, includes archived) but falls back to summing campaign
 * spend when insights are missing.
 */
export function accountSpend(
  accountId: string,
  insights: Record<string, FbInsights | null>,
  campaigns: FbCampaign[],
): number {
  const insSpend = insights[accountId]?.spend;
  if (insSpend) return Number(insSpend);
  return campaigns
    .filter((c) => c._accountId === accountId)
    .reduce((sum, c) => sum + spendOf(c), 0);
}

// ── Sorting ────────────────────────────────────────────────

/** Value extractor for sort on a given column. */
function sortValueOf(
  c: FbCampaign,
  key: FinSortKey,
  rowMarkups: Record<string, number>,
  defaultMarkup: number,
): string | number {
  switch (key) {
    case "name":
      return c.name;
    case "acct":
      return c._accountName ?? "";
    case "spend":
      return spendOf(c);
    case "markup":
      return markupFor(c.id, rowMarkups, defaultMarkup);
    case "plus": {
      const m = markupFor(c.id, rowMarkups, defaultMarkup);
      return spendOf(c) * (1 + m / 100);
    }
    default:
      return 0;
  }
}

/** Sort + pinned-to-top a list of campaigns. Mirrors legacy behavior. */
export function sortFinanceRows(
  campaigns: FbCampaign[],
  sort: FinSortState,
  pinnedIds: string[],
  rowMarkups: Record<string, number>,
  defaultMarkup: number,
): FbCampaign[] {
  const compare = (a: FbCampaign, b: FbCampaign) => {
    if (!sort.key) return 0;
    const va = sortValueOf(a, sort.key, rowMarkups, defaultMarkup);
    const vb = sortValueOf(b, sort.key, rowMarkups, defaultMarkup);
    const cmp =
      typeof va === "string" && typeof vb === "string"
        ? va.localeCompare(vb)
        : (va as number) - (vb as number);
    return sort.dir === "asc" ? cmp : -cmp;
  };
  const pinned = campaigns.filter((c) => pinnedIds.includes(c.id)).sort(compare);
  const unpinned = campaigns.filter((c) => !pinnedIds.includes(c.id)).sort(compare);
  return [...pinned, ...unpinned];
}

/**
 * Row-by-row filter: "hide zero spend" + name search. `search` is
 * compared case-insensitively against both campaign name AND account
 * name (legacy behavior).
 */
export function filterFinanceRows(
  campaigns: FbCampaign[],
  hideZero: boolean,
  search: string,
): FbCampaign[] {
  const q = search.trim().toLowerCase();
  return campaigns.filter((c) => {
    if (hideZero && spendOf(c) <= 0) return false;
    if (q) {
      const name = c.name.toLowerCase();
      const acct = (c._accountName ?? "").toLowerCase();
      if (!name.includes(q) && !acct.includes(q)) return false;
    }
    return true;
  });
}

// ── CSV export ──────────────────────────────────────────────

export interface CsvExportInput {
  rows: FbCampaign[];
  defaultMarkup: number;
  rowMarkups: Record<string, number>;
  /** Include the "廣告帳號" column (all-accounts mode). */
  includeAccountColumn: boolean;
}

/** Build the CSV text. Caller is responsible for download. */
export function buildFinanceCsv(input: CsvExportInput): string {
  const { rows, defaultMarkup, rowMarkups, includeAccountColumn } = input;
  const header = includeAccountColumn
    ? ["No.", "狀態", "廣告帳號", "行銷活動名稱", "花費", "月%", "花費+%"]
    : ["No.", "狀態", "行銷活動名稱", "花費", "月%", "花費+%"];
  const records: Array<Array<string | number>> = [header];
  rows.forEach((camp, i) => {
    const sp = spendOf(camp);
    const m = markupFor(camp.id, rowMarkups, defaultMarkup);
    const cells: Array<string | number> = [
      i + 1,
      camp.status,
      camp.name,
      sp.toFixed(0),
      `${m}%`,
      spendPlus(sp, m),
    ];
    if (includeAccountColumn) {
      cells.splice(2, 0, camp._accountName ?? "");
    }
    records.push(cells);
  });
  return records
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

/**
 * Account-panel row data: one row per visible account with spend
 * and spend+markup, plus a synthetic "全部帳戶" row at the top.
 *
 * `dotState` mirrors the dashboard sidebar status indicator so the
 * Finance panel can render the same `<StatusDot/>` pattern.
 */
export interface FinAccountRow {
  id: string; // "__all__" for the header row
  label: string;
  spend: number;
  plus: number;
  loaded: boolean;
  isTotal: boolean;
  dotState: "on" | "off";
}

export function buildAccountRows(
  accounts: FbAccount[],
  insights: Record<string, FbInsights | null>,
  campaigns: FbCampaign[],
  rowMarkups: Record<string, number>,
  defaultMarkup: number,
): FinAccountRow[] {
  const perAccount: FinAccountRow[] = accounts.map((acc) => {
    const spend = accountSpend(acc.id, insights, campaigns);
    const m = markupFor(acc.id, rowMarkups, defaultMarkup);
    const plus = spend * (1 + m / 100);
    const loaded = insights[acc.id] !== undefined;
    return {
      id: acc.id,
      label: acc.name,
      spend,
      plus,
      loaded,
      isTotal: false,
      dotState: (acc.account_status === 1 ? "on" : "off") as "on" | "off",
    };
  });

  const totalSpend = perAccount.reduce((s, a) => s + a.spend, 0);
  const totalPlus = perAccount.reduce((s, a) => s + a.plus, 0);
  const allLoaded = perAccount.every((r) => r.loaded);

  return [
    {
      id: "__all__",
      label: "全部帳戶",
      spend: totalSpend,
      plus: totalPlus,
      loaded: allLoaded,
      isTotal: true,
      dotState: "on",
    },
    ...perAccount,
  ];
}
