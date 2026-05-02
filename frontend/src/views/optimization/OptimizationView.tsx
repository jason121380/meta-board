import { useAccounts } from "@/api/hooks/useAccounts";
import { useMultiAccountOverview } from "@/api/hooks/useMultiAccountOverview";
import { DatePicker } from "@/components/DatePicker";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { Topbar } from "@/layout/Topbar";
import { useAccountsStore } from "@/stores/accountsStore";
import { useFiltersStore } from "@/stores/filtersStore";
import { useUiStore } from "@/stores/uiStore";
import { useMemo, useState } from "react";
import { OptimizationActionList } from "./OptimizationActionList";
import { OptimizationSummaryStrip } from "./OptimizationSummaryStrip";
import { buildOptimizationItems, summarizeOptimization } from "./optimizationData";

/**
 * 成效優化中心 — pulls every visible account's "currently running"
 * campaigns into a 3-column priority board (需立即處理 / 建議觀察 /
 * 表現良好). Designed as a one-stop morning review: scan the leftmost
 * orange column first, decide what to act on, click through to Ads
 * Manager.
 */
export function OptimizationView() {
  const accountsQuery = useAccounts();
  const allAccounts = accountsQuery.data ?? [];
  const visibleAll = useAccountsStore((s) => s.visibleAccounts)(allAccounts);

  const settingsReady = useUiStore((s) => s.settingsReady);
  const date = useFiltersStore((s) => s.date.optimization);
  const setDate = useFiltersStore((s) => s.setDate);

  const overview = useMultiAccountOverview(visibleAll, date, { includeArchived: false });

  const allItems = useMemo(() => buildOptimizationItems(overview.campaigns), [overview.campaigns]);

  const [search, setSearch] = useState("");

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((it) => {
      const hay = `${it.campaign.name} ${it.campaign._accountName ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allItems, search]);

  const summary = useMemo(() => summarizeOptimization(allItems), [allItems]);

  const businessIdForCampaign = (accountId: string | undefined) => {
    if (!accountId) return undefined;
    return allAccounts.find((a) => a.id === accountId)?.business?.id;
  };

  return (
    <>
      <Topbar title="成效優化中心">
        <DatePicker value={date} onChange={(cfg) => setDate("optimization", cfg)} />
      </Topbar>

      <div className="min-w-0 flex-1 p-3 md:p-5">
        {!settingsReady ? (
          <LoadingState
            title="載入優化資料中..."
            loaded={overview.loadedCount}
            total={overview.totalCount}
          />
        ) : visibleAll.length === 0 ? (
          <EmptyState>請先在設定中啟用廣告帳戶</EmptyState>
        ) : overview.isLoading || overview.insightsPending ? (
          <LoadingState
            title="分析所有行銷活動中..."
            loaded={overview.loadedCount}
            total={overview.totalCount}
          />
        ) : allItems.length === 0 ? (
          <EmptyState>目前沒有正在進行中的行銷活動</EmptyState>
        ) : (
          <div className="flex flex-col gap-3 md:gap-4">
            <OptimizationSummaryStrip summary={summary} />

            {/* Search-only filter row — severity is now expressed by the
                three columns themselves, so no severity checkboxes. */}
            <div className="flex items-center justify-end">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                placeholder="搜尋活動或帳號"
                className="h-8 w-full rounded-lg border border-border bg-white px-2.5 text-[13px] text-ink placeholder:text-gray-300 focus:border-orange focus:outline-none md:w-[260px]"
              />
            </div>

            {visibleItems.length === 0 ? (
              <EmptyState>沒有符合搜尋的行銷活動</EmptyState>
            ) : (
              <OptimizationActionList
                items={visibleItems}
                businessIdForCampaign={businessIdForCampaign}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}
