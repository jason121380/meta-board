import { api } from "@/api/client";
import { useFbAuth } from "@/auth/FbAuthProvider";
import type { FbCampaign } from "@/types/fb";
import { useQueries } from "@tanstack/react-query";
import type { MonthCol } from "./historyData";

/**
 * Fire N parallel `/api/overview` requests — one per month column —
 * for a single account. Each query caches independently (keyed on
 * accountId + monthKey) so revisiting the view is instant and
 * switching between accounts only triggers the not-yet-seen months.
 *
 * Historical months never change (the only "moving" column is the
 * current month), so stale time is generous — 1 hour. The current
 * month uses the same key but the backend's own 60s cache keeps it
 * fresh enough for a manual refresh to notice new spend.
 */
export function useHistoricalSpend(accountId: string | null, months: MonthCol[]) {
  const { status } = useFbAuth();
  const enabled = status === "auth" && !!accountId;

  const results = useQueries({
    queries: months.map((col) => ({
      queryKey: ["history-month", accountId, col.key],
      queryFn: async () => {
        if (!accountId) return { campaigns: [] as FbCampaign[] };
        const resp = await api.overview.batch([accountId], col.date, {
          includeArchived: true,
        });
        const bundle = resp.data[accountId];
        return { campaigns: bundle?.campaigns ?? [] };
      },
      enabled,
      staleTime: 60 * 60_000,
    })),
  });

  const monthlyCampaigns = results.map((r) => r.data?.campaigns);
  const isLoading = results.some((r) => r.isLoading);
  const isFetching = results.some((r) => r.isFetching);
  const loadedCount = results.filter((r) => r.isSuccess).length;

  return {
    monthlyCampaigns,
    isLoading,
    isFetching,
    loadedCount,
    totalCount: months.length,
  };
}
