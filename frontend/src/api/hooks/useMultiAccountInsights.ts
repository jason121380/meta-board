import { api } from "@/api/client";
import { useFbAuth } from "@/auth/FbAuthProvider";
import type { DateConfig } from "@/lib/datePicker";
import type { FbInsights } from "@/types/fb";
import { useQueries } from "@tanstack/react-query";

/**
 * Parallel insights fetch for a list of account ids. Uses useQueries so
 * the number of queries can change across renders without violating
 * React's rules-of-hooks.
 *
 * Returns { data, isLoading, isError } where data is a map of
 * accountId → FbInsights | null. Keys are always present for every
 * requested accountId, value is null while pending.
 */
export interface MultiAccountInsightsResult {
  data: Record<string, FbInsights | null>;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  /** How many account insights have resolved so far (success or error). */
  loadedCount: number;
  /** Total number of account insights queries. */
  totalCount: number;
}

export function useMultiAccountInsights(
  accountIds: string[],
  date: DateConfig,
): MultiAccountInsightsResult {
  const { status } = useFbAuth();
  const queries = useQueries({
    queries: accountIds.map((id) => ({
      queryKey: ["insights", id, date],
      queryFn: async () => {
        const res = await api.accounts.insights(id, date);
        return res.data?.[0] ?? null;
      },
      enabled: status === "auth",
      staleTime: 30_000,
    })),
  });

  const data: Record<string, FbInsights | null> = {};
  let isLoading = false;
  let isFetching = false;
  let isError = false;
  let loadedCount = 0;
  accountIds.forEach((id, i) => {
    const q = queries[i];
    data[id] = (q?.data as FbInsights | null | undefined) ?? null;
    if (q?.isLoading) isLoading = true;
    else loadedCount += 1;
    if (q?.isFetching) isFetching = true;
    if (q?.isError) isError = true;
  });

  return {
    data,
    isLoading,
    isFetching,
    isError,
    loadedCount,
    totalCount: accountIds.length,
  };
}
