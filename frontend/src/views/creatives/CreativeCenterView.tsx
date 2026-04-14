import { useAccounts } from "@/api/hooks/useAccounts";
import { useMultiAccountAds } from "@/api/hooks/useMultiAccountAds";
import { CreativePreviewModal } from "@/components/CreativePreviewModal";
import { DatePicker } from "@/components/DatePicker";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { RefreshButton } from "@/components/RefreshButton";
import { Topbar, TopbarSeparator } from "@/layout/Topbar";
import { useAccountsStore } from "@/stores/accountsStore";
import { useFiltersStore } from "@/stores/filtersStore";
import type { FbCreativeEntity } from "@/types/fb";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CreativeTable, type CreativeSortKey, type CreativeSortState } from "./CreativeTable";

/**
 * Creative Center (素材中心) — a flat, sortable aggregation of every
 * 3rd-level ad across every enabled account. Complements the per-
 * account tree view on Dashboard by letting the user rank creatives
 * cross-account (find the best / worst performers without drilling
 * down to individual adsets).
 *
 * Data pipeline:
 *   1. useAccounts → visible accounts (filtered by Settings selection)
 *   2. useMultiAccountAds → parallel /api/accounts/{id}/ads for each,
 *      flattened to a single FbCreativeEntity[] with _accountId /
 *      _accountName injected
 *   3. Client-side search + sort + preview modal
 *
 * Clicking a row opens the shared <CreativePreviewModal/> so the
 * video / image preview behavior matches the Dashboard tree exactly.
 */
export function CreativeCenterView() {
  const queryClient = useQueryClient();

  const accountsQuery = useAccounts();
  const allAccounts = accountsQuery.data ?? [];
  const visible = useAccountsStore((s) => s.visibleAccounts)(allAccounts);

  const date = useFiltersStore((s) => s.date.creatives);
  const setDate = useFiltersStore((s) => s.setDate);

  const adsQuery = useMultiAccountAds(visible, date);

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
      <Topbar title="素材中心">
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

      <div className="flex flex-1 flex-col overflow-hidden p-3 md:p-4">
        <div className="m-0 flex flex-1 flex-col overflow-hidden rounded-2xl border border-border">
          <div className="flex shrink-0 flex-wrap items-center gap-2.5 rounded-t-2xl border-b border-border bg-white px-3 py-2.5 md:px-4 md:py-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              placeholder="搜尋素材 / 行銷活動 / 帳戶..."
              className="h-10 max-w-[320px] flex-1 rounded-pill border-[1.5px] border-border bg-bg px-4 text-[13px] outline-none focus:border-orange focus:bg-white md:h-[34px] md:px-3"
            />
            <span className="whitespace-nowrap text-xs text-gray-500">
              {adsQuery.isLoading
                ? `${adsQuery.loadedCount} / ${adsQuery.totalCount} 個帳戶`
                : `${filtered.length} 個素材`}
            </span>
          </div>

          {Object.keys(adsQuery.errors).length > 0 && (
            <div className="border-b border-red-bg bg-red-bg/40 px-4 py-2.5 text-[12px] text-red">
              <div className="font-semibold">部分帳戶載入失敗:</div>
              {Object.entries(adsQuery.errors).map(([acctId, msg]) => {
                const name = visible.find((a) => a.id === acctId)?.name ?? acctId;
                return (
                  <div key={acctId} className="mt-0.5 break-all">
                    <span className="font-medium">{name}</span>: {msg}
                  </div>
                );
              })}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto">
            {visible.length === 0 ? (
              <EmptyState>請先在設定中啟用廣告帳戶</EmptyState>
            ) : adsQuery.isLoading ? (
              <LoadingState
                title="載入素材中..."
                loaded={adsQuery.loadedCount}
                total={adsQuery.totalCount}
              />
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

      <CreativePreviewModal creative={preview} onClose={() => setPreview(null)} />
    </>
  );
}
