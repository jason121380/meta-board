import { api } from "@/api/client";
import { useFbAuth } from "@/auth/FbAuthProvider";
import type { DateConfig } from "@/lib/datePicker";
import { useQuery } from "@tanstack/react-query";

/**
 * Fetch adsets for a campaign. Lazily enabled: only fires when
 * `campaignId` is defined AND the caller toggles `enabled` (usually
 * when the user expands the campaign row).
 */
export function useAdsets(campaignId: string | null, date: DateConfig, enabled: boolean) {
  const { status } = useFbAuth();
  return useQuery({
    queryKey: ["adsets", campaignId, date],
    queryFn: async () => {
      if (!campaignId) return [];
      const res = await api.campaigns.adsets(campaignId, date);
      return res.data ?? [];
    },
    enabled: status === "auth" && !!campaignId && enabled,
    staleTime: 30_000,
  });
}
