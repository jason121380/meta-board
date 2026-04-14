import { api } from "@/api/client";
import { useFbAuth } from "@/auth/FbAuthProvider";
import type { DateConfig } from "@/lib/datePicker";
import type { FbAccount, FbCampaign, FbInsights } from "@/types/fb";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

/**
 * Batch multi-account overview hook.
 *
 * Consolidates what used to be ``useMultiAccountCampaigns`` +
 * ``useMultiAccountInsights`` (2 × N parallel `useQueries`) into a
 * single `useQuery` that hits the backend `/api/overview` batch
 * endpoint. The backend fans out to FB via `asyncio.gather`, so
 * there's no browser-side concurrency cap to queue behind.
 *
 * Return shape is designed to be a drop-in replacement for the two
 * old hooks combined: `campaigns` is a flattened array with
 * `_accountId` / `_accountName` injected (same as
 * `useMultiAccountCampaigns`), and `insights` is a `Record<acctId,
 * FbInsights | null>` (same as `useMultiAccountInsights.data`).
 *
 * Trade-off vs `useQueries`: a single query key covers all
 * accounts, so if the account set changes by even one element the
 * whole batch re-runs (vs per-account caching with useQueries).
 * This is fine for views that always load a stable account set
 * (Analytics / Alerts use visible accounts; Finance uses visible
 * for its left panel and filters client-side).
 */

export interface MultiAccountOverviewResult {
  /** Flattened campaigns across all requested accounts. */
  campaigns: FbCampaign[];
  /** Per-account insights keyed by account id (flat first entry). */
  insights: Record<string, FbInsights | null>;
  /** Per-account error messages keyed by account id. */
  errors: Record<string, string>;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  /** 0 while the batch is in flight, `totalCount` after it resolves. */
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

  const query = useQuery({
    queryKey: ["overview", idsKey, date, !!opts.includeArchived],
    queryFn: async () => {
      if (sortedIds.length === 0) {
        return { data: {} } as Awaited<ReturnType<typeof api.overview.batch>>;
      }
      return api.overview.batch(sortedIds, date, opts);
    },
    enabled: status === "auth" && accounts.length > 0,
    staleTime: 5 * 60_000,
  });

  const { campaigns, insights, errors } = useMemo(() => {
    const camps: FbCampaign[] = [];
    const insMap: Record<string, FbInsights | null> = {};
    const errs: Record<string, string> = {};

    // Seed every requested id so downstream code can rely on the
    // key existing even for accounts that returned an error.
    for (const acc of accounts) {
      insMap[acc.id] = null;
    }

    const data = query.data?.data ?? {};
    for (const [acctId, bundle] of Object.entries(data)) {
      const acc = accounts.find((a) => a.id === acctId);
      const acctName = acc?.name ?? "";
      if (bundle.error) {
        errs[acctId] = bundle.error;
      }
      // Inject account context onto each campaign so multi-account
      // views can render the account column without a second lookup.
      for (const c of bundle.campaigns ?? []) {
        camps.push({ ...c, _accountId: acctId, _accountName: acctName });
      }
      insMap[acctId] = bundle.insights ?? null;
    }

    return { campaigns: camps, insights: insMap, errors: errs };
  }, [accounts, query.data]);

  return {
    campaigns,
    insights,
    errors,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    // Batch loading is binary — either everything is loaded or
    // nothing is. The LoadingState component already handles the
    // total=N, loaded=0 case with an indeterminate shimmer bar.
    loadedCount: query.isLoading ? 0 : accounts.length,
    totalCount: accounts.length,
  };
}
