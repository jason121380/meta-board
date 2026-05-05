import { api } from "@/api/client";
import type { DateConfig } from "@/lib/datePicker";
import type { FbAdset, FbCampaign, FbCreativeEntity } from "@/types/fb";
import { useQuery } from "@tanstack/react-query";

/** Lazy fetch of ads inside a single adset for the report's 3rd-level
 *  expansion. Same shared-token pattern as `useReportCampaign`. */
export function useReportAds(adsetId: string | null, date: DateConfig, enabled: boolean) {
  return useQuery({
    queryKey: ["report-ads", adsetId, date] as const,
    queryFn: async (): Promise<FbCreativeEntity[]> => {
      if (!adsetId) return [];
      return (await api.adsets.creatives(adsetId, date)).data ?? [];
    },
    enabled: enabled && !!adsetId,
    staleTime: 5 * 60_000,
  });
}

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
    staleTime: 5 * 60_000,
  });

  const adsetsQuery = useQuery({
    queryKey: ["report-adsets", campaignId, date],
    queryFn: async (): Promise<FbAdset[]> => {
      if (!campaignId) return [];
      const resp = await api.campaigns.adsets(campaignId, date);
      return resp.data ?? [];
    },
    enabled,
    staleTime: 5 * 60_000,
  });

  return { campaignQuery, adsetsQuery };
}
