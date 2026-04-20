import { useAccounts } from "@/api/hooks/useAccounts";
import { AcctSidebarToggle } from "@/components/AcctSidebarToggle";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { MobileAccountPicker } from "@/components/MobileAccountPicker";
import { Topbar } from "@/layout/Topbar";
import { useAccountsStore } from "@/stores/accountsStore";
import { useUiStore } from "@/stores/uiStore";
import { useEffect, useMemo, useState } from "react";
import { AccountPanel } from "../dashboard/AccountPanel";
import { HistoryTable } from "./HistoryTable";
import { aggregateHistory, buildMonthCols } from "./historyData";
import { useHistoricalSpend } from "./useHistoricalSpend";

/**
 * 歷史花費 view — single-account picker on the left, 6-month spend
 * matrix on the right. Each row is a campaign, each column a month
 * (newest → oldest). The current month is partial month-to-date; the
 * five prior months are full calendar months.
 */
export function HistoryView() {
  const accountsQuery = useAccounts();
  const allAccounts = accountsQuery.data ?? [];
  const visibleAccounts = useAccountsStore((s) => s.visibleAccounts)(allAccounts);
  const settingsReady = useUiStore((s) => s.settingsReady);

  // Local selection state — this view intentionally does NOT reuse the
  // dashboard's activeIds so navigating between them doesn't stomp on
  // each other's context. One account at a time.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedId) {
      const stillVisible = visibleAccounts.some((a) => a.id === selectedId);
      if (stillVisible) return;
    }
    const first = visibleAccounts[0];
    setSelectedId(first ? first.id : null);
  }, [selectedId, visibleAccounts]);

  // Months are pure-data; compute once per day boundary via useMemo.
  // Using new Date() inside the memo is fine — the dep array is empty
  // so the instance is stable for the component's lifetime, matching
  // the other views' "date resolved at mount" behavior.
  const months = useMemo(() => buildMonthCols(new Date(), 6), []);

  const { monthlyCampaigns, isLoading, loadedCount, totalCount } = useHistoricalSpend(
    selectedId,
    months,
  );

  const rows = useMemo(
    () => aggregateHistory(months, monthlyCampaigns),
    [months, monthlyCampaigns],
  );

  return (
    <>
      <Topbar title="歷史花費" titleAction={<AcctSidebarToggle />}>
        <MobileAccountPicker
          accounts={visibleAccounts}
          selectedId={selectedId}
          onSelect={(id) => {
            if (id === null) return;
            setSelectedId(id);
          }}
          includeAllOption={false}
          className="bg-transparent px-0 py-0"
        />
      </Topbar>

      <div className="flex min-w-0 items-start md:flex-row">
        <div className="hidden md:flex">
          <AccountPanel
            accounts={visibleAccounts}
            activeAccountId={selectedId}
            isLoading={accountsQuery.isLoading}
            onSelect={(account) => setSelectedId(account.id)}
          />
        </div>

        <div className="min-w-0 flex-1 p-3 md:p-4">
          <div className="overflow-hidden rounded-2xl border border-border bg-white">
            <div className="border-b border-border bg-white px-4 py-3">
              <div className="text-[13px] font-semibold text-ink">近 6 個月廣告花費</div>
              <div className="mt-0.5 text-[11px] text-gray-500">
                以行銷活動為單位,橫向比較本月與前 5 個完整月份的花費
              </div>
            </div>

            <div className="w-full overflow-x-auto">
              {!settingsReady ? (
                <LoadingState
                  title="載入歷史花費中..."
                  loaded={loadedCount}
                  total={totalCount}
                />
              ) : visibleAccounts.length === 0 ? (
                <EmptyState>請先在設定中啟用廣告帳戶</EmptyState>
              ) : !selectedId ? (
                <EmptyState>從左側選擇廣告帳戶</EmptyState>
              ) : isLoading ? (
                <LoadingState
                  title="載入歷史花費中..."
                  loaded={loadedCount}
                  total={totalCount}
                  estimatedDurationMs={12000}
                />
              ) : rows.length === 0 ? (
                <EmptyState>近 6 個月無花費紀錄</EmptyState>
              ) : (
                <HistoryTable months={months} rows={rows} />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
