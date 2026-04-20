import type { DateConfig } from "@/lib/datePicker";
import { fmtDate } from "@/lib/datePicker";
import { getIns } from "@/lib/insights";
import type { FbCampaign } from "@/types/fb";

/**
 * 歷史花費 pure helpers — month-column builder + per-campaign spend
 * aggregator. No React / no network; unit-testable in isolation.
 */

export interface MonthCol {
  /** Stable key for React + cache, e.g. "2026-04". */
  key: string;
  /** Header display label, e.g. "2026/04". */
  label: string;
  /** Secondary hint, e.g. "本月" / "上個月". Only the two most recent
   * months carry a hint; older months return null. */
  hint: string | null;
  /** DateConfig sent to the overview endpoint for this month. */
  date: DateConfig;
}

/** Build N month columns, newest-first. The newest column ends at
 * `now` (partial month-to-date); every older column covers the full
 * calendar month start → last day. */
export function buildMonthCols(now: Date = new Date(), count = 6): MonthCol[] {
  const cols: MonthCol[] = [];
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  for (let i = 0; i < count; i++) {
    const mStart = new Date(year, month - i, 1);
    const mEndFull = new Date(year, month - i + 1, 0);
    const end = i === 0 ? now : mEndFull;
    const y = mStart.getFullYear();
    const m = mStart.getMonth() + 1;
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const label = `${y}/${String(m).padStart(2, "0")}`;
    const hint = i === 0 ? "本月" : i === 1 ? "上個月" : null;
    cols.push({
      key,
      label,
      hint,
      date: {
        preset: "custom",
        from: fmtDate(mStart),
        to: fmtDate(end),
      },
    });
  }
  return cols;
}

export interface HistoryRow {
  campaignId: string;
  campaignName: string;
  /** Spend keyed by MonthCol.key. 0 if the campaign had no spend that month. */
  spendByMonth: Record<string, number>;
  total: number;
}

/** Merge month-sliced campaign arrays into one row per campaign id.
 * Campaigns that only appeared in some months still get zero entries
 * for the other months so the table renders dashes consistently. */
export function aggregateHistory(
  months: MonthCol[],
  monthlyCampaigns: Array<FbCampaign[] | undefined>,
): HistoryRow[] {
  const byId = new Map<string, HistoryRow>();
  months.forEach((col, i) => {
    const list = monthlyCampaigns[i];
    if (!list) return;
    for (const c of list) {
      const spend = Number(getIns(c).spend) || 0;
      const row = byId.get(c.id) ?? {
        campaignId: c.id,
        campaignName: c.name,
        spendByMonth: {},
        total: 0,
      };
      // Prefer the most recent month's name if the id was seen earlier
      // under a different name (rename mid-quarter) — newest col is i=0.
      if (i === 0) row.campaignName = c.name;
      row.spendByMonth[col.key] = (row.spendByMonth[col.key] ?? 0) + spend;
      row.total += spend;
      byId.set(c.id, row);
    }
  });
  return [...byId.values()].sort((a, b) => b.total - a.total);
}

/** Sum spend for each month column across every row — used for the
 * footer "合計" line. */
export function monthTotals(rows: HistoryRow[], months: MonthCol[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const col of months) totals[col.key] = 0;
  for (const r of rows) {
    for (const col of months) {
      totals[col.key] = (totals[col.key] ?? 0) + (r.spendByMonth[col.key] ?? 0);
    }
  }
  return totals;
}
