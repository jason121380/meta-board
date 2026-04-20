import { api } from "@/api/client";
import type { DateConfig } from "@/lib/datePicker";
import type { FbAdset, FbCampaign } from "@/types/fb";
import { useQuery } from "@tanstack/react-query";

/**
 * Fetch a single campaign + its adsets for the public share page.
 *
 * Auth: these endpoints use the backend's shared `_runtime_token`, so
 * they work without the viewer being logged into Facebook. If the
 * team admin's token expires / server restarts with no re-login,
 * every request here returns 401 and the page shows an error state.
 */
export function useReportCampaign(
  campaignId: string | null,
  accountId: string | null,
  date: DateConfig,
) {
  const enabled = !!campaignId && !!accountId;

  const campaignQuery = useQuery({
    queryKey: ["report-campaign", accountId, campaignId, date],
    queryFn: async (): Promise<FbCampaign | null> => {
      if (!accountId || !campaignId) return null;
      const resp = await api.accounts.campaigns(accountId, date, true);
      return resp.data?.find((c) => c.id === campaignId) ?? null;
    },
    enabled,
    staleTime: 60_000,
  });

  const adsetsQuery = useQuery({
    queryKey: ["report-adsets", campaignId, date],
    queryFn: async (): Promise<FbAdset[]> => {
      if (!campaignId) return [];
      const resp = await api.campaigns.adsets(campaignId, date);
      return resp.data ?? [];
    },
    enabled,
    staleTime: 60_000,
  });

  return { campaignQuery, adsetsQuery };
}
