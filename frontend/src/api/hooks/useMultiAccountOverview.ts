import { api } from "@/api/client";
import { useFbAuth } from "@/auth/FbAuthProvider";
import type { DateConfig } from "@/lib/datePicker";
import type { FbAccount, FbCampaign, FbInsights } from "@/types/fb";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

/**
 * Two-phase batch multi-account overview hook.
 *
 * Phase 1 ("lite"): fetches campaign metadata WITHOUT insights
 * (~1-2s). The tree table renders rows immediately — campaign
 * names, statuses, and budget badges appear while numbers show "—".
 *
 * Phase 2 ("full"): fetches campaigns WITH inline insights + account
 * insights (~5-15s). Once this resolves the tree table fills in
 * spend, CTR, CPC, and all numeric columns.
 *
 * Both requests fly in parallel. The lite result populates the UI
 * first; the full result replaces it when ready. TanStack Query
 * caches both independently — on subsequent loads within 5 minutes,
 * the full data is served instantly from cache.
 *
 * Return shape is the same as the previous single-phase hook so all
 * consumers (Dashboard, Alerts, Finance, Analytics) work unchanged.
 */

export interface MultiAccountOverviewResult {
  /** Flattened campaigns across all requested accounts. */
  campaigns: FbCampaign[];
  /** Per-account insights keyed by account id (flat first entry). */
  insights: Record<string, FbInsights | null>;
  /** Per-account error messages keyed by account id. */
  errors: Record<string, string>;
  /** True while BOTH lite and full are still loading (nothing to show). */
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  loadedCount: number;
  totalCount: number;
}

export function useMultiAccountOverview(
  accounts: FbAccount[],
  date: DateConfig,
  opts: { includeArchived?: boolean } = {},
): MultiAccountOverviewResult {
  const { status } = useFbAuth();

  // Sort ids so cache keys are stable regardless of array order.
  const sortedIds = useMemo(() => {
    return [...accounts.map((a) => a.id)].sort();
  }, [accounts]);
  const idsKey = sortedIds.join(",");

  const enabled = status === "auth" && accounts.length > 0;

  // Phase 1: lite (no insights — fast)
  const liteQuery = useQuery({
    queryKey: ["overview-lite", idsKey, date, !!opts.includeArchived],
    queryFn: async () => {
      if (sortedIds.length === 0) {
        return { data: {} } as Awaited<ReturnType<typeof api.overview.batch>>;
      }
      return api.overview.batch(sortedIds, date, { ...opts, lite: true });
    },
    enabled,
    staleTime: 5 * 60_000,
  });

  // Phase 2: full (with insights — slow)
  const fullQuery = useQuery({
    queryKey: ["overview", idsKey, date, !!opts.includeArchived],
    queryFn: async () => {
      if (sortedIds.length === 0) {
        return { data: {} } as Awaited<ReturnType<typeof api.overview.batch>>;
      }
      return api.overview.batch(sortedIds, date, opts);
    },
    enabled,
    staleTime: 5 * 60_000,
  });

  // Prefer full data when available, fall back to lite.
  const activeData = fullQuery.data ?? liteQuery.data;

  const { campaigns, insights, errors } = useMemo(() => {
    const camps: FbCampaign[] = [];
    const insMap: Record<string, FbInsights | null> = {};
    const errs: Record<string, string> = {};

    for (const acc of accounts) {
      insMap[acc.id] = null;
    }

    const data = activeData?.data ?? {};
    for (const [acctId, bundle] of Object.entries(data)) {
      const acc = accounts.find((a) => a.id === acctId);
      const acctName = acc?.name ?? "";
      if (bundle.error) {
        errs[acctId] = bundle.error;
      }
      for (const c of bundle.campaigns ?? []) {
        camps.push({ ...c, _accountId: acctId, _accountName: acctName });
      }
      insMap[acctId] = bundle.insights ?? null;
    }

    return { campaigns: camps, insights: insMap, errors: errs };
  }, [accounts, activeData]);

  // isLoading = nothing to show yet (both lite and full still loading).
  // Once lite resolves, we have campaigns to render.
  const isLoading = liteQuery.isLoading && fullQuery.isLoading;

  return {
    campaigns,
    insights,
    errors,
    isLoading,
    isFetching: fullQuery.isFetching,
    isError: fullQuery.isError && liteQuery.isError,
    loadedCount: isLoading ? 0 : accounts.length,
    totalCount: accounts.length,
  };
}
