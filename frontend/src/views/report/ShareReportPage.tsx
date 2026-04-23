import { useReportCampaign } from "@/api/hooks/useReportCampaign";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import type { DateConfig, DatePreset } from "@/lib/datePicker";
import { toLabel } from "@/lib/datePicker";
import { ReportContent } from "@/views/dashboard/ReportContent";
import { useMemo, useState } from "react";

/**
 * Public share-report page. Mounted by App.tsx BEFORE the auth gate
 * when the pathname starts with `/r/` — there is no FB login required
 * to view.
 *
 * Reads campaign_id from the pathname segment and `acct` / `hide` /
 * `date` from the query string. Fetches live data through the backend
 * (which uses the shared runtime token on the server).
 *
 * Layout is intentionally bare — no sidebar, no topbar, no nav. The
 * viewer only sees the report card.
 */
export function ShareReportPage() {
  const { campaignId, accountId, initialHide, datePreset } = useMemo(() => parseUrl(), []);

  const date: DateConfig = useMemo(
    () => ({ preset: datePreset, from: null, to: null }),
    [datePreset],
  );

  const [hideMoney, setHideMoney] = useState(initialHide);

  const { campaignQuery, adsetsQuery } = useReportCampaign(campaignId, accountId, date);

  const campaign = campaignQuery.data ?? null;

  return (
    <div className="min-h-screen bg-bg py-6 md:py-10">
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-4 px-3 md:px-6">
        <header className="flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[12px] font-semibold uppercase tracking-[0.6px] text-orange">
              LURE META PLATFORM
            </div>
            <div className="text-[11px] text-gray-500">行銷活動報告 · {toLabel(date)}</div>
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[12px] text-gray-500">
            <input
              type="checkbox"
              className="custom-cb"
              checked={hideMoney}
              onChange={(e) => setHideMoney(e.currentTarget.checked)}
            />
            不顯示金額
          </label>
        </header>

        <div className="rounded-2xl border border-border bg-white p-4 md:p-6">
          {!campaignId || !accountId ? (
            <EmptyState>報告連結參數不正確</EmptyState>
          ) : campaignQuery.isLoading ? (
            <LoadingState title="載入報告中..." />
          ) : campaignQuery.isError ? (
            <EmptyState>
              無法載入報告：
              {campaignQuery.error instanceof Error ? campaignQuery.error.message : "未知錯誤"}
            </EmptyState>
          ) : !campaign ? (
            <EmptyState>找不到此行銷活動</EmptyState>
          ) : (
            <ReportContent
              campaign={campaign}
              adsets={adsetsQuery.data ?? null}
              adsetsLoading={adsetsQuery.isLoading}
              adsetsError={adsetsQuery.error instanceof Error ? adsetsQuery.error.message : null}
              hideMoney={hideMoney}
              dateLabel={toLabel(date)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function parseUrl(): {
  campaignId: string | null;
  accountId: string | null;
  initialHide: boolean;
  datePreset: DatePreset;
} {
  if (typeof window === "undefined") {
    return { campaignId: null, accountId: null, initialHide: true, datePreset: "this_month" };
  }
  const path = window.location.pathname;
  const match = path.match(/^\/r\/([^/]+)/);
  const campaignId = match?.[1] ? decodeURIComponent(match[1]) : null;
  const params = new URLSearchParams(window.location.search);
  const accountId = params.get("acct");
  const initialHide = params.get("hide") === "1";
  const rawDate = params.get("date") ?? "this_month";
  const datePreset = isValidPreset(rawDate) ? rawDate : "this_month";
  return { campaignId, accountId, initialHide, datePreset };
}

function isValidPreset(s: string): s is DatePreset {
  return (
    s === "today" ||
    s === "yesterday" ||
    s === "last_7d" ||
    s === "last_30d" ||
    s === "last_90d" ||
    s === "this_month" ||
    s === "last_month"
  );
}
