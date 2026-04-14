import { useAccounts } from "@/api/hooks/useAccounts";
import { useMultiAccountCampaigns } from "@/api/hooks/useMultiAccountCampaigns";
import { useMultiAccountInsights } from "@/api/hooks/useMultiAccountInsights";
import { Button } from "@/components/Button";
import { DatePicker } from "@/components/DatePicker";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { MobileAccountPicker } from "@/components/MobileAccountPicker";
import { RefreshButton } from "@/components/RefreshButton";
import { Topbar, TopbarSeparator } from "@/layout/Topbar";
import { toLabel } from "@/lib/datePicker";
import { useAccountsStore } from "@/stores/accountsStore";
import { useFiltersStore } from "@/stores/filtersStore";
import { useFinanceStore } from "@/stores/financeStore";
import { useUiStore } from "@/stores/uiStore";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FinanceAccountPanel } from "./FinanceAccountPanel";
import { FinanceTable } from "./FinanceTable";
import {
  buildAccountRows,
  buildFinanceCsv,
  filterFinanceRows,
  sortFinanceRows,
} from "./financeData";

/**
 * Finance view (財務專區) — left account panel + toolbar + campaign
 * table with per-row markup calculator and pin-to-top.
 *
 * The "全部帳戶 / single account" mode switch is driven by
 * uiStore.finSelectedAcctIds: empty = all, [id] = single.
 *
 * CSV export builds a string via buildFinanceCsv() and pushes it to
 * the browser via a data URL anchor click (matches legacy).
 */
export function FinanceView() {
  const queryClient = useQueryClient();

  const accountsQuery = useAccounts();
  const allAccounts = accountsQuery.data ?? [];
  const visible = useAccountsStore((s) => s.visibleAccounts)(allAccounts);

  const date = useFiltersStore((s) => s.date.finance);
  const setDate = useFiltersStore((s) => s.setDate);

  const finSelectedAcctIds = useUiStore((s) => s.finSelectedAcctIds);
  const setFinSelectedAcctIds = useUiStore((s) => s.setFinSelectedAcctIds);

  const rowMarkups = useFinanceStore((s) => s.rowMarkups);
  const defaultMarkup = useFinanceStore((s) => s.defaultMarkup);
  const setDefaultMarkup = useFinanceStore((s) => s.setDefaultMarkup);
  const pinnedIds = useFinanceStore((s) => s.pinnedIds);

  const [search, setSearch] = useState("");
  const [hideZero, setHideZero] = useState(true);

  // Fetch per-account insights (authoritative spend) and campaigns
  // for every visible account, even in single-account drilldown mode
  // so the left panel can still render totals.
  const insights = useMultiAccountInsights(
    visible.map((a) => a.id),
    date,
  );
  const campaignsQuery = useMultiAccountCampaigns(visible, date, {
    includeArchived: true,
  });

  const selectedId = finSelectedAcctIds.length === 1 ? (finSelectedAcctIds[0] ?? null) : null;

  // Slice campaigns for the right-side table based on selection
  const tableCampaigns = useMemo(() => {
    if (selectedId === null) return campaignsQuery.campaigns;
    return campaignsQuery.campaigns.filter((c) => c._accountId === selectedId);
  }, [campaignsQuery.campaigns, selectedId]);

  // Build left-panel rows (always across ALL visible accounts)
  const accountRows = useMemo(
    () =>
      buildAccountRows(visible, insights.data, campaignsQuery.campaigns, rowMarkups, defaultMarkup),
    [visible, insights.data, campaignsQuery.campaigns, rowMarkups, defaultMarkup],
  );

  const onRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    queryClient.invalidateQueries({ queryKey: ["insights"] });
  };

  const onDownloadCsv = () => {
    const filtered = filterFinanceRows(tableCampaigns, hideZero, search);
    const sorted = sortFinanceRows(
      filtered,
      { key: null, dir: "desc" },
      pinnedIds,
      rowMarkups,
      defaultMarkup,
    );
    const csv = buildFinanceCsv({
      rows: sorted,
      defaultMarkup,
      rowMarkups,
      includeAccountColumn: selectedId === null,
    });
    // Format the filename using the date label so users know which
    // period the export covers.
    const label = toLabel(date).replace(/[/ ~]/g, "_");
    const filename = `財務報表_${label}.csv`;
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Topbar title="財務專區">
        <div className="flex items-center gap-3">
          <DatePicker value={date} onChange={(cfg) => setDate("finance", cfg)} />
          <TopbarSeparator />
          <RefreshButton
            isFetching={campaignsQuery.isFetching || insights.isFetching}
            onClick={onRefresh}
          />
          <Button
            variant="ghost"
            size="sm"
            title="下載 CSV"
            aria-label="下載 CSV"
            onClick={onDownloadCsv}
            className="h-10 min-w-[40px] px-2.5 text-base md:h-[30px] md:min-w-0"
          >
            <span aria-hidden="true">⬇</span>
          </Button>
        </div>
      </Topbar>

      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        {/* Desktop sidebar (≥768px) */}
        <div className="hidden md:flex">
          <FinanceAccountPanel
            rows={accountRows}
            selectedId={selectedId}
            onSelect={(id) => setFinSelectedAcctIds(id ? [id] : [])}
          />
        </div>

        {/* Mobile picker (<768px) — opens a modal */}
        <div className="border-b border-border md:hidden">
          <MobileAccountPicker
            accounts={visible}
            selectedId={selectedId}
            onSelect={(id) => setFinSelectedAcctIds(id ? [id] : [])}
          />
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-white px-3 py-2.5 md:gap-2.5 md:px-5">
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
                checked={hideZero}
                onChange={(e) => setHideZero(e.currentTarget.checked)}
              />
              有花費
            </label>
            <div className="flex items-center gap-1">
              <span className="whitespace-nowrap text-xs text-gray-500">月%</span>
              <input
                type="number"
                value={defaultMarkup}
                min={0}
                max={100}
                step={0.5}
                onChange={(e) => {
                  const v = Number.parseFloat(e.currentTarget.value);
                  if (!Number.isNaN(v)) setDefaultMarkup(v);
                }}
                className="h-10 w-[58px] rounded-lg border-[1.5px] border-border px-1 text-center text-[13px] md:h-8 md:w-[54px]"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {visible.length === 0 ? (
              <EmptyState>請先在設定中啟用廣告帳戶</EmptyState>
            ) : campaignsQuery.isLoading ? (
              <LoadingState
                title="載入財務資料中..."
                loaded={campaignsQuery.loadedCount}
                total={campaignsQuery.totalCount}
              />
            ) : (
              <FinanceTable
                campaigns={tableCampaigns}
                multiAcct={selectedId === null}
                search={search}
                hideZero={hideZero}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
