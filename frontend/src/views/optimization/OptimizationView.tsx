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
import {
  type OptimizationSeverity,
  buildOptimizationItems,
  summarizeOptimization,
} from "./optimizationData";

/**
 * 成效優化中心 — pulls every visible account's "currently running"
 * campaigns into a single priority-ranked action list with reused
 * recommendation logic. Designed as a one-stop morning review:
 * scan the orange (critical) rows, decide what to act on, click
 * through to Ads Manager.
 */
export function OptimizationView() {
  const accountsQuery = useAccounts();
  const allAccounts = accountsQuery.data ?? [];
  const visibleAll = useAccountsStore((s) => s.visibleAccounts)(allAccounts);

  const settingsReady = useUiStore((s) => s.settingsReady);
  const date = useFiltersStore((s) => s.date.optimization);
  const setDate = useFiltersStore((s) => s.setDate);

  // Single batched fetch for every visible account. includeArchived
  // is false because the optimization view only cares about live
  // (or recently-paused-with-spend) campaigns.
  const overview = useMultiAccountOverview(visibleAll, date, { includeArchived: false });

  const allItems = useMemo(() => buildOptimizationItems(overview.campaigns), [overview.campaigns]);

  // Filter checkboxes — default to showing only critical/warning so
  // the operator's eye lands on items needing action. They can opt
  // in to "good" rows for a holistic view.
  const [showCritical, setShowCritical] = useState(true);
  const [showWarning, setShowWarning] = useState(true);
  const [showGood, setShowGood] = useState(false);
  const [search, setSearch] = useState("");

  const visibleItems = useMemo(() => {
    const enabled: Record<OptimizationSeverity, boolean> = {
      critical: showCritical,
      warning: showWarning,
      good: showGood,
    };
    const q = search.trim().toLowerCase();
    return allItems.filter((it) => {
      if (!enabled[it.severity]) return false;
      if (!q) return true;
      const hay = `${it.campaign.name} ${it.campaign._accountName ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allItems, showCritical, showWarning, showGood, search]);

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

            {/* Filter row */}
            <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-white px-3.5 py-3 md:flex-row md:items-center md:gap-3">
              <div className="flex flex-wrap items-center gap-3 text-[12px] md:text-[13px]">
                <SeverityFilter
                  label={`需立即處理 (${summary.criticalCount})`}
                  color="bg-orange"
                  checked={showCritical}
                  onChange={setShowCritical}
                />
                <SeverityFilter
                  label={`建議觀察 (${summary.warningCount})`}
                  color="bg-amber-400"
                  checked={showWarning}
                  onChange={setShowWarning}
                />
                <SeverityFilter
                  label={`表現良好 (${summary.goodCount})`}
                  color="bg-emerald-500"
                  checked={showGood}
                  onChange={setShowGood}
                />
              </div>
              <div className="md:ml-auto">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.currentTarget.value)}
                  placeholder="搜尋活動或帳號"
                  className="h-8 w-full rounded-lg border border-border bg-white px-2.5 text-[13px] text-ink placeholder:text-gray-300 focus:border-orange focus:outline-none md:w-[220px]"
                />
              </div>
            </div>

            {visibleItems.length === 0 ? (
              <EmptyState>沒有符合篩選條件的行銷活動</EmptyState>
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

function SeverityFilter({
  label,
  color,
  checked,
  onChange,
}: {
  label: string;
  color: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5">
      <input
        type="checkbox"
        className="custom-cb"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${color}`} />
      <span className="text-ink">{label}</span>
    </label>
  );
}
