import { useAccounts } from "@/api/hooks/useAccounts";
import { useMultiAccountOverview } from "@/api/hooks/useMultiAccountOverview";
import { AcctSidebarToggle } from "@/components/AcctSidebarToggle";
import { DatePicker } from "@/components/DatePicker";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { MobileAccountPicker } from "@/components/MobileAccountPicker";
import { RefreshButton } from "@/components/RefreshButton";
import { Topbar, TopbarSeparator } from "@/layout/Topbar";
import { cn } from "@/lib/cn";
import { getIns } from "@/lib/insights";
import { useAccountsStore } from "@/stores/accountsStore";
import { useFiltersStore } from "@/stores/filtersStore";
import { useUiStore } from "@/stores/uiStore";
import { useQueryClient } from "@tanstack/react-query";
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { AccountPanel } from "./AccountPanel";
import type { BudgetModalTarget } from "./BudgetModal";
import { StatsGrid } from "./StatsGrid";
import { TreeTable } from "./TreeTable";

// Heavier on-demand chunks: BudgetModal is only shown when the user
// clicks the 預算 pill (maybe 5% of sessions). ComparisonTable only
// renders when the 素材比較 checkbox is on (maybe 2% of sessions).
// Lazy-loading them lets the Dashboard first-paint ship with a
// smaller main-view chunk.
const BudgetModal = lazy(() => import("./BudgetModal").then((m) => ({ default: m.BudgetModal })));
const ComparisonTable = lazy(() =>
  import("./ComparisonTable").then((m) => ({ default: m.ComparisonTable })),
);

/**
 * Dashboard view — the most complex view in the app. Composes:
 *   - <AccountPanel/>  (left 240px column, single-select behavior)
 *   - <Topbar/>        (title + DatePicker + activeOnly toggle + refresh)
 *   - <StatsGrid/>     (12 KPI stats for the active account(s))
 *   - <TreeTable/>     (3-level campaign → adset → creative table)
 *   - <BudgetModal/>   (edit daily budget — lazy-loaded)
 *   - <ComparisonTable/> (flat creative view — lazy-loaded)
 *
 * State sources:
 *   - useAccountsStore → which accounts are visible (Settings) and
 *     which one(s) are currently active
 *   - useFiltersStore  → dashboard date config + "only with spend" toggle
 *   - useUiStore       → tree expand/collapse + sort (inside TreeTable)
 *
 * Server data: single batched `/api/overview` call via
 * `useMultiAccountOverview`. Previously Dashboard fired
 * `useMultiAccountInsights` + `useMultiAccountCampaigns` (2×N
 * parallel queries — bottlenecked on the browser's 6-connection
 * HTTP/1.1 limit). Moving to the overview endpoint consolidates
 * to one request per visible-account set, matching Analytics /
 * Alerts / Finance so all four views share the same cache entry
 * when the account set + date are identical (tab-switching is
 * instant).
 */
export function DashboardView() {
  const queryClient = useQueryClient();

  // Accounts
  const accountsQuery = useAccounts();
  const allAccounts = accountsQuery.data ?? [];
  const visibleAccounts = useAccountsStore((s) => s.visibleAccounts)(allAccounts);
  const activeIds = useAccountsStore((s) => s.activeIds);
  const setActiveIds = useAccountsStore((s) => s.setActiveIds);

  // Auto-select the first visible account as soon as the accounts
  // list resolves and the user has no selection yet. Without this,
  // a first-time user who's just saved their Settings would land on
  // the Dashboard with an empty state ("從左側選擇廣告帳戶") and
  // have to click an account in the sidebar to trigger loading —
  // which the user reported as a confusing "nothing loaded" moment
  // right after they configured everything. Auto-selecting the
  // top row fires the overview query immediately so the dashboard
  // is populated on arrival.
  //
  // Guards:
  //   - Only runs when visibleAccounts is non-empty (nothing to
  //     select otherwise)
  //   - Only runs when activeIds is empty (don't stomp on an
  //     existing selection the user deliberately made)
  //   - The effect's only state-mutation is `setActiveIds`, which
  //     is a stable Zustand setter — no loop risk
  useEffect(() => {
    if (activeIds.length > 0) return;
    if (visibleAccounts.length === 0) return;
    const first = visibleAccounts[0];
    if (first) setActiveIds([first.id]);
  }, [activeIds, visibleAccounts, setActiveIds]);

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

  // Server data — single batched overview request
  const overview = useMultiAccountOverview(activeAccounts, date, {
    includeArchived: true,
  });

  // Local UI state
  const [searchTerm, setSearchTerm] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [budgetTarget, setBudgetTarget] = useState<BudgetModalTarget | null>(null);

  // Stable handler for BudgetModal — passed down to every
  // CampaignRow / AdsetRow so React.memo equality actually holds.
  // Without useCallback, every parent render creates a new function
  // reference and breaks the memo. See CampaignRow for the memo
  // contract.
  const openBudget = useCallback((target: BudgetModalTarget) => {
    setBudgetTarget(target);
  }, []);

  // Refresh → invalidate the overview + per-adset creatives (other
  // view caches share the overview key so they re-populate on demand)
  const onRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["overview"] });
    queryClient.invalidateQueries({ queryKey: ["adsets"] });
    queryClient.invalidateQueries({ queryKey: ["creatives"] });
  };

  // Filter campaigns by "only with spend" + account-scope
  const filteredCampaigns = useMemo(() => {
    if (!activeOnly) return overview.campaigns;
    return overview.campaigns.filter((c) => Number(getIns(c).spend) > 0);
  }, [overview.campaigns, activeOnly]);

  const multiAcct = activeAccounts.length > 1;

  const setTreeSort = useUiStore((s) => s.setTreeSort);
  const statsCollapsed = useUiStore((s) => s.statsCollapsed);
  const toggleStatsCollapsed = useUiStore((s) => s.toggleStatsCollapsed);

  return (
    <>
      <Topbar title="儀表板" titleAction={<AcctSidebarToggle />}>
        <div className="flex items-center gap-2 md:gap-3">
          <DatePicker value={date} onChange={(cfg) => setDate("dashboard", cfg)} />
          <button
            type="button"
            onClick={toggleStatsCollapsed}
            title={statsCollapsed ? "展開上方數據區" : "收合上方數據區，給下方表格更多空間"}
            aria-label={statsCollapsed ? "展開數據區" : "收合數據區"}
            aria-pressed={statsCollapsed}
            className={cn(
              "hidden h-9 w-9 items-center justify-center rounded-xl border-[1.5px] text-ink active:scale-95 md:flex",
              statsCollapsed
                ? "border-orange bg-orange-bg text-orange"
                : "border-border bg-white hover:border-orange-border hover:bg-orange-bg hover:text-orange",
            )}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {statsCollapsed ? (
                <>
                  <polyline points="6 9 12 15 18 9" />
                </>
              ) : (
                <>
                  <polyline points="18 15 12 9 6 15" />
                </>
              )}
            </svg>
          </button>
          <span className="hidden md:inline">
            <TopbarSeparator />
          </span>
          <label className="hidden cursor-pointer items-center gap-1.5 whitespace-nowrap text-[13px] text-gray-500 md:flex">
            <input
              type="checkbox"
              className="custom-cb"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.currentTarget.checked)}
            />
            只顯示有花費
          </label>
          <span className="hidden md:inline">
            <TopbarSeparator />
          </span>
          <RefreshButton isFetching={overview.isFetching} onClick={onRefresh} />
        </div>
      </Topbar>

      <div className="flex min-h-0 flex-1 md:flex-row">
        {/* Desktop sidebar (≥768px) */}
        <div className="hidden md:flex">
          <AccountPanel
            accounts={visibleAccounts}
            activeAccountId={activeAccountId}
            isLoading={accountsQuery.isLoading}
            onSelect={(account) => setActiveIds([account.id])}
          />
        </div>

        {/* Mobile picker (<768px) — opens a modal */}
        <div className="border-b border-border md:hidden">
          <MobileAccountPicker
            accounts={visibleAccounts}
            selectedId={activeAccountId}
            onSelect={(id) => {
              if (id === null) return;
              const acc = visibleAccounts.find((a) => a.id === id);
              if (acc) setActiveIds([acc.id]);
            }}
            includeAllOption={false}
          />
        </div>

        <div className="flex-1">
          {!statsCollapsed && (
            <StatsGrid
              accounts={activeAccounts}
              insights={overview.insights}
              isLoading={overview.isLoading || overview.insightsPending}
            />
          )}

          {/* Tree card — sized to content. The entire right column
              scrolls as one unit (overflow-y-auto on parent), so the
              card only occupies the height its table rows need. No
              more blank space below the last row. */}
          <div className="mx-3 mb-3 mt-3 flex flex-col overflow-hidden rounded-2xl border border-border md:mx-4 md:mb-4 md:mt-4">
            <div className="flex shrink-0 flex-wrap items-center gap-2.5 border-b border-border bg-white px-3 py-2.5 first:rounded-t-2xl md:px-4 md:py-3">
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.currentTarget.value)}
                placeholder={compareMode ? "搜尋素材..." : "搜尋行銷活動..."}
                className="h-10 max-w-[260px] flex-1 rounded-pill border-[1.5px] border-border bg-bg px-4 text-[13px] outline-none focus:border-orange focus:bg-white md:h-[34px] md:px-3"
              />
              <label
                className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[12px] text-gray-500 md:text-[13px]"
                title="只顯示已展開的第三層素材,方便並排比較"
              >
                <input
                  type="checkbox"
                  className="custom-cb"
                  checked={compareMode}
                  onChange={(e) => {
                    const on = e.currentTarget.checked;
                    setCompareMode(on);
                    // Reset sort when entering comparison mode so the
                    // default CTR-desc kicks in (ComparisonTable's
                    // effectiveSort fallback).
                    if (on) setTreeSort(null);
                  }}
                />
                素材比較
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[12px] text-gray-500 md:hidden">
                <input
                  type="checkbox"
                  className="custom-cb"
                  checked={activeOnly}
                  onChange={(e) => setActiveOnly(e.currentTarget.checked)}
                />
                有花費
              </label>
              <span className="whitespace-nowrap text-xs text-gray-500">
                {overview.isLoading ? "…" : `${filteredCampaigns.length} 個活動`}
              </span>
            </div>
            {!overview.isLoading && Object.keys(overview.errors).length > 0 && (
              <div className="border-b border-red-bg bg-red-bg/40 px-4 py-2.5 text-[12px] text-red">
                <div className="font-semibold">部分帳戶載入失敗：</div>
                {Object.entries(overview.errors).map(([acctId, msg]) => {
                  const name = activeAccounts.find((a) => a.id === acctId)?.name ?? acctId;
                  return (
                    <div key={acctId} className="mt-0.5 break-all">
                      <span className="font-medium">{name}</span>: {msg}
                    </div>
                  );
                })}
              </div>
            )}
            <div>
              {activeAccounts.length === 0 ? (
                <EmptyState>從左側選擇廣告帳戶</EmptyState>
              ) : overview.isLoading ? (
                <LoadingState
                  title="載入行銷活動中..."
                  loaded={overview.loadedCount}
                  total={overview.totalCount}
                />
              ) : compareMode ? (
                <Suspense fallback={<LoadingState title="載入比較檢視..." />}>
                  <ComparisonTable multiAcct={multiAcct} date={date} searchTerm={searchTerm} />
                </Suspense>
              ) : (
                <TreeTable
                  campaigns={filteredCampaigns}
                  multiAcct={multiAcct}
                  date={date}
                  onOpenBudget={openBudget}
                  searchTerm={searchTerm}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {budgetTarget !== null && (
        <Suspense fallback={null}>
          <BudgetModal
            open={!!budgetTarget}
            target={budgetTarget}
            onClose={() => setBudgetTarget(null)}
          />
        </Suspense>
      )}
    </>
  );
}
