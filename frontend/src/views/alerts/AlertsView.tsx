import { useAccounts } from "@/api/hooks/useAccounts";
import { useMultiAccountOverview } from "@/api/hooks/useMultiAccountOverview";
import { AcctSidebarToggle } from "@/components/AcctSidebarToggle";
import { DatePicker } from "@/components/DatePicker";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { MobileAccountPicker } from "@/components/MobileAccountPicker";
import { RefreshButton } from "@/components/RefreshButton";
import { Topbar, TopbarSeparator } from "@/layout/Topbar";
import { useAccountsStore } from "@/stores/accountsStore";
import { useFiltersStore } from "@/stores/filtersStore";
import { useUiStore } from "@/stores/uiStore";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { AlertAccountPanel } from "./AlertAccountPanel";
import { AlertCard } from "./AlertCard";
import { computeAlertBuckets } from "./alertsData";

/**
 * Alerts view — 240px account panel + 3 side-by-side cards
 * (私訊成本過高 / CPC 過高 / 頻次過高) with per-card sort and
 * keyword filter.
 *
 * Ported from dashboard.html lines 2874–3148 + view markup
 * at lines 1008–1030.
 */
export function AlertsView() {
  const queryClient = useQueryClient();

  const accountsQuery = useAccounts();
  const allAccounts = accountsQuery.data ?? [];
  const visibleAll = useAccountsStore((s) => s.visibleAccounts)(allAccounts);

  const selectedAcctId = useUiStore((s) => s.alertSelectedAcctId);
  const setSelectedAcctId = useUiStore((s) => s.setAlertSelectedAcctId);

  const date = useFiltersStore((s) => s.date.alerts);
  const setDate = useFiltersStore((s) => s.setDate);

  // Batch endpoint — ALWAYS request the full visible account set,
  // regardless of which single account the user has clicked in the
  // left panel. Previously this hook was called with a filtered
  // `scopedAccounts` array, which changed the query key every time
  // the user switched accounts → React Query saw a brand new query
  // → loading spinner every click, even though the underlying data
  // for every account was already in the "all accounts" cache entry.
  // Fetching once for the full set and filtering CLIENT-SIDE below
  // makes per-account switching instant.
  const overview = useMultiAccountOverview(visibleAll, date, { includeArchived: true });

  const scopedCampaigns = useMemo(() => {
    if (selectedAcctId === null) return overview.campaigns;
    return overview.campaigns.filter((c) => c._accountId === selectedAcctId);
  }, [overview.campaigns, selectedAcctId]);

  const buckets = useMemo(() => computeAlertBuckets(scopedCampaigns), [scopedCampaigns]);

  const businessIdForCampaign = (accountId: string | undefined) => {
    if (!accountId) return undefined;
    return allAccounts.find((a) => a.id === accountId)?.business?.id;
  };

  const onRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["overview"] });
  };

  return (
    <>
      <Topbar title="警示列表" titleAction={<AcctSidebarToggle />}>
        <div className="flex items-center gap-3">
          <DatePicker value={date} onChange={(cfg) => setDate("alerts", cfg)} />
          <TopbarSeparator />
          <RefreshButton isFetching={overview.isFetching} onClick={onRefresh} title="重新分析" />
        </div>
      </Topbar>

      {/* Mobile account picker — pinned below Topbar */}
      <div className="shrink-0 border-b border-border md:hidden">
        <MobileAccountPicker
          accounts={visibleAll}
          selectedId={selectedAcctId}
          onSelect={setSelectedAcctId}
        />
      </div>

      <div className="flex items-start md:flex-row">
        {/* Desktop sidebar (≥768px) */}
        <div className="hidden md:flex">
          <AlertAccountPanel
            accounts={visibleAll}
            selectedAccountId={selectedAcctId}
            onSelect={setSelectedAcctId}
          />
        </div>

        <div className="flex-1 p-3 md:p-5">
          {visibleAll.length === 0 ? (
            <EmptyState>請先在設定中啟用廣告帳戶</EmptyState>
          ) : overview.isLoading || (overview.campaigns.length === 0 && overview.isFetching) ? (
            <LoadingState
              title="分析廣告資料中..."
              loaded={overview.loadedCount}
              total={overview.totalCount}
            />
          ) : overview.campaigns.length === 0 ? (
            <EmptyState>無廣告資料可分析</EmptyState>
          ) : (
            <div className="grid items-start gap-3 md:grid-cols-[repeat(auto-fit,minmax(280px,1fr))] md:gap-3.5">
              <AlertCard
                cardKey="msg"
                title="私訊成本過高"
                description="私訊成本 > $200"
                entries={buckets.msg}
                filterLabel="只顯示標題含私訊"
                businessIdForCampaign={businessIdForCampaign}
              />
              <AlertCard
                cardKey="cpc"
                title="CPC 過高"
                description="示警 >$4 ／ 過高 >$5"
                entries={buckets.cpc}
                filterLabel="隱藏標題含私訊"
                businessIdForCampaign={businessIdForCampaign}
              />
              <AlertCard
                cardKey="freq"
                title="頻次過高"
                description="示警 >4 ／ 過高 >5"
                entries={buckets.freq}
                filterLabel={null}
                businessIdForCampaign={businessIdForCampaign}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
