import { useAccounts } from "@/api/hooks/useAccounts";
import { useMultiAccountCampaigns } from "@/api/hooks/useMultiAccountCampaigns";
import { useMultiAccountInsights } from "@/api/hooks/useMultiAccountInsights";
import { DatePicker } from "@/components/DatePicker";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { RefreshButton } from "@/components/RefreshButton";
import { Topbar, TopbarSeparator } from "@/layout/Topbar";
import { getIns } from "@/lib/insights";
import { useAccountsStore } from "@/stores/accountsStore";
import { useFiltersStore } from "@/stores/filtersStore";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AccountPanel } from "./AccountPanel";
import { BudgetModal, type BudgetModalTarget } from "./BudgetModal";
import { StatsGrid } from "./StatsGrid";
import { TreeTable } from "./TreeTable";

/**
 * Dashboard view — the most complex view in the app. Composes:
 *   - <AccountPanel/>  (left 240px column, single-select behavior)
 *   - <Topbar/>        (title + DatePicker + activeOnly toggle + refresh)
 *   - <StatsGrid/>     (12 KPI stats for the active account(s))
 *   - <TreeTable/>     (3-level campaign → adset → creative table)
 *   - <BudgetModal/>   (edit daily budget for a campaign or adset)
 *
 * State sources:
 *   - useAccountsStore → which accounts are visible (Settings) and
 *     which one(s) are currently active
 *   - useFiltersStore  → dashboard date config + "only with spend" toggle
 *   - useUiStore       → tree expand/collapse + sort (inside TreeTable)
 *
 * Server data:
 *   - useAccounts()              → list of FbAccount
 *   - useMultiAccountInsights()  → KPI stats
 *   - useMultiAccountCampaigns() → tree data (includes archived +
 *                                   archived-stripped fallback, per
 *                                   FastAPI main.py behavior)
 */
export function DashboardView() {
  const queryClient = useQueryClient();

  // Accounts
  const accountsQuery = useAccounts();
  const allAccounts = accountsQuery.data ?? [];
  const visibleAccounts = useAccountsStore((s) => s.visibleAccounts)(allAccounts);
  const activeIds = useAccountsStore((s) => s.activeIds);
  const setActiveIds = useAccountsStore((s) => s.setActiveIds);

  const activeAccounts = useMemo(
    () => visibleAccounts.filter((a) => activeIds.includes(a.id)),
    [visibleAccounts, activeIds],
  );
  const activeAccountId = activeAccounts[0]?.id ?? null;

  // Filters (date + activeOnly)
  const date = useFiltersStore((s) => s.date.dashboard);
  const setDate = useFiltersStore((s) => s.setDate);
  const activeOnly = useFiltersStore((s) => s.activeOnly);
  const setActiveOnly = useFiltersStore((s) => s.setActiveOnly);

  // Server data
  const insights = useMultiAccountInsights(
    activeAccounts.map((a) => a.id),
    date,
  );
  const campaignsQuery = useMultiAccountCampaigns(activeAccounts, date, {
    includeArchived: true,
  });

  // Local UI state
  const [searchTerm, setSearchTerm] = useState("");
  const [budgetTarget, setBudgetTarget] = useState<BudgetModalTarget | null>(null);

  // Refresh → invalidate the cached queries for the selected accounts
  const onRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    queryClient.invalidateQueries({ queryKey: ["insights"] });
    queryClient.invalidateQueries({ queryKey: ["adsets"] });
    queryClient.invalidateQueries({ queryKey: ["creatives"] });
  };

  // Filter campaigns by "only with spend" + account-scope
  const filteredCampaigns = useMemo(() => {
    if (!activeOnly) return campaignsQuery.campaigns;
    return campaignsQuery.campaigns.filter((c) => Number(getIns(c).spend) > 0);
  }, [campaignsQuery.campaigns, activeOnly]);

  const multiAcct = activeAccounts.length > 1;

  return (
    <>
      <Topbar title="儀表板">
        <div className="flex items-center gap-3">
          <DatePicker value={date} onChange={(cfg) => setDate("dashboard", cfg)} />
          <TopbarSeparator />
          <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[13px] text-gray-500">
            <input
              type="checkbox"
              className="custom-cb"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.currentTarget.checked)}
            />
            只顯示有花費
          </label>
          <TopbarSeparator />
          <RefreshButton
            isFetching={campaignsQuery.isFetching || insights.isFetching}
            onClick={onRefresh}
          />
        </div>
      </Topbar>

      <div className="flex flex-1 overflow-hidden">
        <AccountPanel
          accounts={visibleAccounts}
          activeAccountId={activeAccountId}
          isLoading={accountsQuery.isLoading}
          onSelect={(account) => setActiveIds([account.id])}
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          <StatsGrid
            accounts={activeAccounts}
            insights={insights.data}
            isLoading={insights.isLoading}
          />

          <div className="m-4 flex flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-white">
            <div className="flex shrink-0 items-center gap-2.5 rounded-t-2xl border-b border-border px-4 py-3">
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.currentTarget.value)}
                placeholder="搜尋行銷活動..."
                className="h-[34px] max-w-[260px] flex-1 rounded-pill border-[1.5px] border-border bg-bg px-3 text-[13px] outline-none focus:border-orange focus:bg-white"
              />
              <span className="text-xs text-gray-500">
                {campaignsQuery.isLoading ? "…" : `${filteredCampaigns.length} 個活動`}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {activeAccounts.length === 0 ? (
                <EmptyState>從左側選擇廣告帳戶</EmptyState>
              ) : campaignsQuery.isLoading ? (
                <LoadingState
                  title="載入行銷活動中..."
                  loaded={campaignsQuery.loadedCount}
                  total={campaignsQuery.totalCount}
                />
              ) : (
                <TreeTable
                  campaigns={filteredCampaigns}
                  multiAcct={multiAcct}
                  date={date}
                  onOpenBudget={setBudgetTarget}
                  searchTerm={searchTerm}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <BudgetModal
        open={!!budgetTarget}
        target={budgetTarget}
        onClose={() => setBudgetTarget(null)}
      />
    </>
  );
}
