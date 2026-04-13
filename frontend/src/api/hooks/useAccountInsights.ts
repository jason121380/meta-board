import { api } from "@/api/client";
import { useFbAuth } from "@/auth/FbAuthProvider";
import type { DateConfig } from "@/lib/datePicker";
import { useQuery } from "@tanstack/react-query";

/**
 * Fetch account-level insights (spend, impressions, etc.) for a single
 * account at a given date range. This is the authoritative spend source
 * — the finance and analytics views use it instead of summing per-
 * campaign spend so archived campaigns are included correctly.
 *
 * Matches the legacy `aiInsightData[acc.id]` / `finInsightData[acc.id]`
 * caching with session-scoped keys.
 */
export function useAccountInsights(accountId: string | undefined, date: DateConfig) {
  const { status } = useFbAuth();
  return useQuery({
    queryKey: ["insights", accountId, date],
    queryFn: async () => {
      if (!accountId) return null;
      const res = await api.accounts.insights(accountId, date);
      return res.data?.[0] ?? null;
    },
    enabled: status === "auth" && !!accountId,
    staleTime: 30_000,
  });
}
