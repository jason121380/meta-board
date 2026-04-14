import { useAccounts } from "@/api/hooks/useAccounts";
import { useMultiAccountAds } from "@/api/hooks/useMultiAccountAds";
import { AcctSidebarToggle } from "@/components/AcctSidebarToggle";
import { CreativePreviewModal } from "@/components/CreativePreviewModal";
import { DatePicker } from "@/components/DatePicker";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { MobileAccountPicker } from "@/components/MobileAccountPicker";
import { RefreshButton } from "@/components/RefreshButton";
import { Topbar, TopbarSeparator } from "@/layout/Topbar";
import { useAccountsStore } from "@/stores/accountsStore";
import { useFiltersStore } from "@/stores/filtersStore";
import type { FbCreativeEntity } from "@/types/fb";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AccountPanel } from "../dashboard/AccountPanel";
import {
  CreativeTable,
  CreativeTableSkeleton,
  type CreativeSortKey,
  type CreativeSortState,
} from "./CreativeTable";

/**
 * Creative Center (素材中心) — flat, sortable aggregation of every
 * 3rd-level ad in the currently selected account(s). Complements the
 * per-account tree view on Dashboard by letting the user rank
 * creatives without drilling down into individual adsets.
 *
 * Account selection:
 *   Reuses the Dashboard's `activeIds` from accountsStore so the
 *   selection follows the user across views — you pick an account in
 *   Dashboard, switch to Creative Center, and see the same account's
 *   ads. Same single-select AccountPanel on desktop / MobileAccountPicker
 *   on mobile as Dashboard. A dedicated multi-select would make
 *   loads O(N accounts) slow again; the current pattern keeps
 *   Creative Center fast by default.
 *
 * Data pipeline:
 *   1. useAccounts → visible accounts (Settings-enabled)
 *   2. activeAccounts = visible ∩ activeIds (usually 1)
 *   3. useMultiAccountAds → parallel /api/accounts/{id}/ads for each
 *      active account, flattened to FbCreativeEntity[] with
 *      _accountId / _accountName injected
 *   4. Client-side search + sort + shared preview modal
 */
export function CreativeCenterView() {
  const queryClient = useQueryClient();

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

  const date = useFiltersStore((s) => s.date.creatives);
  const setDate = useFiltersStore((s) => s.setDate);

  const adsQuery = useMultiAccountAds(activeAccounts, date);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<CreativeSortState>({ key: "spend", dir: "desc" });
  const [preview, setPreview] = useState<FbCreativeEntity | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return adsQuery.ads;
    return adsQuery.ads.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.campaign?.name?.toLowerCase().includes(q) ?? false) ||
        (a._accountName?.toLowerCase().includes(q) ?? false),
    );
  }, [adsQuery.ads, search]);

  const onSort = (key: CreativeSortKey) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: "desc" };
    });
  };

  const onRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["account_ads"] });
  };

  return (
    <>
      <Topbar title="素材中心" titleAction={<AcctSidebarToggle />}>
        <div className="flex items-center gap-2 md:gap-3">
          <DatePicker value={date} onChange={(cfg) => setDate("creatives", cfg)} />
          <span className="hidden md:inline">
            <TopbarSeparator />
          </span>
          <RefreshButton
            isFetching={adsQuery.isFetching}
            onClick={onRefresh}
            title="重新載入素材"
          />
        </div>
      </Topbar>

      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        {/* Desktop sidebar (≥768px) — reuses Dashboard's AccountPanel
            so the selection + collapse toggle behavior is identical. */}
        <div className="hidden md:flex">
          <AccountPanel
            accounts={visibleAccounts}
            activeAccountId={activeAccountId}
            isLoading={accountsQuery.isLoading}
            onSelect={(account) => setActiveIds([account.id])}
          />
        </div>

        {/* Mobile picker (<768px) — opens the search-enabled modal. */}
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

        <div className="flex flex-1 flex-col overflow-hidden p-3 md:p-4">
          <div className="m-0 flex flex-1 flex-col overflow-hidden rounded-2xl border border-border">
            <div className="flex shrink-0 flex-wrap items-center gap-2.5 rounded-t-2xl border-b border-border bg-white px-3 py-2.5 md:px-4 md:py-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                placeholder="搜尋素材 / 行銷活動..."
                className="h-10 max-w-[320px] flex-1 rounded-pill border-[1.5px] border-border bg-bg px-4 text-[13px] outline-none focus:border-orange focus:bg-white md:h-[34px] md:px-3"
              />
              <span className="whitespace-nowrap text-xs text-gray-500">
                {adsQuery.isLoading
                  ? "載入中..."
                  : `${filtered.length} 個素材`}
              </span>
            </div>

            {Object.keys(adsQuery.errors).length > 0 && (
              <div className="border-b border-red-bg bg-red-bg/40 px-4 py-2.5 text-[12px] text-red">
                <div className="font-semibold">部分帳戶載入失敗:</div>
                {Object.entries(adsQuery.errors).map(([acctId, msg]) => {
                  const name = visibleAccounts.find((a) => a.id === acctId)?.name ?? acctId;
                  return (
                    <div key={acctId} className="mt-0.5 break-all">
                      <span className="font-medium">{name}</span>: {msg}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="relative min-h-0 flex-1 overflow-auto">
              {activeAccounts.length === 0 ? (
                <EmptyState>從左側選擇廣告帳戶</EmptyState>
              ) : adsQuery.isLoading ? (
                <>
                  {/* Skeleton table gives the user an immediate sense
                      of the layout that's about to materialize — much
                      less jarring than a blank area for a 5-15s first
                      load. */}
                  <CreativeTableSkeleton rows={12} />
                  {/* Floating banner overlay with expectation-setting
                      copy. Positioned absolute so it doesn't push the
                      skeleton around when the data lands. */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-3">
                    <div className="inline-flex items-center gap-2 rounded-full border border-orange-border bg-white px-3.5 py-1.5 text-[12px] font-medium text-orange shadow-sm">
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-[2px] border-border border-t-orange" />
                      載入素材中...首次通常需要 5–15 秒
                    </div>
                  </div>
                </>
              ) : filtered.length === 0 ? (
                <EmptyState>無符合條件的素材</EmptyState>
              ) : (
                <CreativeTable
                  ads={filtered}
                  sort={sort}
                  onSort={onSort}
                  accounts={allAccounts}
                  onRowClick={setPreview}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <CreativePreviewModal creative={preview} onClose={() => setPreview(null)} />
    </>
  );
}
