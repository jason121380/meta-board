import type { DatePreset } from "@/lib/datePicker";

/**
 * Share-link encoder / decoder for the public /r/:campaignId report.
 *
 * The URL is self-contained — no server-side token table. The backend
 * already uses a shared `_runtime_token` (whichever team member last
 * logged in) so any viewer of the link can fetch the data through the
 * existing endpoints without being logged in themselves.
 *
 * URL shape:
 *   /r/{campaign_id}?acct={account_id}&hide=1&date=this_month
 *
 * - `acct` is required — the backend endpoints are scoped per account.
 * - `hide=1` matches the in-app "不顯示金額" toggle. Any non-"1"
 *   value is treated as false.
 * - `date` is optional; defaults to `this_month` on the viewer side.
 */

export interface ShareReportParams {
  campaignId: string;
  accountId: string;
  hideMoney: boolean;
  datePreset?: DatePreset;
  /** When true, the share report renders 花費 as 花費* using the
   *  marked-up amount (spend × (1 + markupPercent/100)). The viewer
   *  gets the same view the operator chose at link-creation time. */
  useSpendPlus?: boolean;
  /** Markup percent — only meaningful when useSpendPlus is true.
   *  Encoded into the URL so the share page renders without needing
   *  to look up shared_settings.finance_row_markups. */
  markupPercent?: number;
}

/** Build an absolute share URL the user can paste anywhere. */
export function buildShareUrl(params: ShareReportParams): string {
  const { campaignId, accountId, hideMoney, datePreset, useSpendPlus, markupPercent } = params;
  const search = new URLSearchParams();
  search.set("acct", accountId);
  if (hideMoney) search.set("hide", "1");
  if (datePreset) search.set("date", datePreset);
  if (useSpendPlus) {
    search.set("plus", "1");
    if (markupPercent !== undefined && markupPercent > 0) {
      // Strip trailing zeros for shorter URLs (5 not 5.0)
      search.set("mkp", String(markupPercent));
    }
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/r/${encodeURIComponent(campaignId)}?${search.toString()}`;
}
