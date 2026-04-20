import { useAccounts } from "@/api/hooks/useAccounts";
import { useNicknames } from "@/api/hooks/useNicknames";
import { AcctSidebarToggle } from "@/components/AcctSidebarToggle";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { MobileAccountPicker } from "@/components/MobileAccountPicker";
import { Topbar } from "@/layout/Topbar";
import { useAccountsStore } from "@/stores/accountsStore";
import { useFinanceStore } from "@/stores/financeStore";
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

  // Nicknames are shared team-wide and already persisted via
  // SettingsProvider → financeStore. Reuse the Finance view's
  // 顯示暱稱 flag so toggling it in either view keeps the two
  // consistent (same data, same preference).
  const nicknamesQuery = useNicknames();
  const nicknames = nicknamesQuery.data ?? {};
  const showNicknames = useFinanceStore((s) => s.showNicknames);
  const setShowNicknames = useFinanceStore((s) => s.setShowNicknames);

  const [search, setSearch] = useState("");
  const [hideZero, setHideZero] = useState(true);

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

  const businessId = useMemo(() => {
    if (!selectedId) return undefined;
    return allAccounts.find((a) => a.id === selectedId)?.business?.id;
  }, [allAccounts, selectedId]);

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
          // Default MobileAccountPicker uses `mr-auto` so the picker
          // sits on the LEFT (to leave room for a DatePicker on the
          // right). 歷史花費 has no DatePicker, so override to align
          // the picker to the right edge instead.
          className="ml-auto mr-0 bg-transparent px-0 py-0"
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
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-white px-3 py-2.5 md:gap-2.5 md:px-5">
              <input
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                placeholder="搜尋活動名稱..."
                className="h-10 min-w-[140px] flex-1 rounded-lg border-[1.5px] border-border px-3 text-[13px] outline-none focus:border-orange md:h-8 md:px-2.5"
              />
              <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-gray-500">
                <input
                  type="checkbox"
                  className="custom-cb"
                  checked={showNicknames}
                  onChange={(e) => setShowNicknames(e.currentTarget.checked)}
                />
                顯示暱稱
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-gray-500">
                <input
                  type="checkbox"
                  className="custom-cb"
                  checked={hideZero}
                  onChange={(e) => setHideZero(e.currentTarget.checked)}
                />
                有花費
              </label>
            </div>

            <div className="w-full overflow-x-auto">
              {!settingsReady ? (
                <LoadingState title="載入歷史花費中..." loaded={loadedCount} total={totalCount} />
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
                <HistoryTable
                  months={months}
                  rows={rows}
                  search={search}
                  hideZero={hideZero}
                  showNicknames={showNicknames}
                  nicknames={nicknames}
                  accountId={selectedId}
                  businessId={businessId}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
