import { api } from "@/api/client";
import { useFbAuth } from "@/auth/FbAuthProvider";
import type { DateConfig } from "@/lib/datePicker";
import type { FbAdset } from "@/types/fb";
import { useQuery } from "@tanstack/react-query";

/**
 * Fetch adsets for a campaign. Lazily enabled: only fires when
 * `campaignId` is defined AND the caller toggles `enabled` (usually
 * when the user expands the campaign row).
 *
 * placeholderData keeps previously-fetched rows visible while a
 * refetch is in flight (e.g. when the user changes the date) so the
 * tree row doesn't collapse to a loading spinner mid-expansion.
 */
export function useAdsets(campaignId: string | null, date: DateConfig, enabled: boolean) {
  const { status } = useFbAuth();
  return useQuery({
    queryKey: ["adsets", campaignId, date],
    queryFn: async (): Promise<FbAdset[]> => {
      if (!campaignId) return [];
      const res = await api.campaigns.adsets(campaignId, date);
      return res.data ?? [];
    },
    enabled: status === "auth" && !!campaignId && enabled,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}
