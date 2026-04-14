import { api } from "@/api/client";
import { useFbAuth } from "@/auth/FbAuthProvider";
import type { DateConfig } from "@/lib/datePicker";
import type { FbAccount, FbCreativeEntity } from "@/types/fb";
import { useQueries } from "@tanstack/react-query";

/**
 * Parallel fetch of every ad (3rd level) across a list of accounts,
 * flattened to a single array with `_accountId` / `_accountName`
 * injected on every row so the Creative Center table can render
 * the parent account inline without a second lookup.
 *
 * One `useQueries` entry per account. Progress counters let the
 * loading state render "N / M 個帳戶已載入" without custom bookkeeping.
 */

export interface MultiAccountAdsResult {
  ads: FbCreativeEntity[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  errors: Record<string, string>;
  loadedCount: number;
  totalCount: number;
}

export function useMultiAccountAds(
  accounts: FbAccount[],
  date: DateConfig,
): MultiAccountAdsResult {
  const { status } = useFbAuth();
  const queries = useQueries({
    queries: accounts.map((acc) => ({
      queryKey: ["account_ads", acc.id, date],
      queryFn: async (): Promise<FbCreativeEntity[]> => {
        const res = await api.accounts.ads(acc.id, date);
        return (res.data ?? []).map((ad) => ({
          ...ad,
          _accountId: acc.id,
          _accountName: acc.name,
        }));
      },
      enabled: status === "auth",
      staleTime: 5 * 60_000,
    })),
  });

  const ads: FbCreativeEntity[] = [];
  const errors: Record<string, string> = {};
  let isLoading = false;
  let isFetching = false;
  let allErrored = accounts.length > 0;
  let loadedCount = 0;

  accounts.forEach((acc, i) => {
    const q = queries[i];
    if (!q) return;
    if (q.isLoading) isLoading = true;
    else loadedCount += 1;
    if (q.isFetching) isFetching = true;
    if (q.isError) {
      errors[acc.id] = q.error instanceof Error ? q.error.message : "Unknown error";
    } else {
      allErrored = false;
      const rows = (q.data as FbCreativeEntity[] | undefined) ?? [];
      ads.push(...rows);
    }
  });

  return {
    ads,
    isLoading,
    isFetching,
    isError: allErrored,
    errors,
    loadedCount,
    totalCount: accounts.length,
  };
}
