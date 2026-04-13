import { api } from "@/api/client";
import { useFbAuth } from "@/auth/FbAuthProvider";
import type { DateConfig } from "@/lib/datePicker";
import type { FbCreativeEntity } from "@/types/fb";
import { useQuery } from "@tanstack/react-query";

/**
 * Fetch creatives (the 3rd tree level) for an adset. Lazily enabled
 * when the user expands an adset row.
 *
 * IMPORTANT: The class used to render these rows is `creative-row`
 * (NOT `ad-row`) — ad blockers match `[class^="ad-"]` and hide any
 * element whose class name starts with `ad-`. See commit d720fa2.
 *
 * placeholderData keeps previously-fetched rows visible during refetch.
 */
export function useCreatives(adsetId: string | null, date: DateConfig, enabled: boolean) {
  const { status } = useFbAuth();
  return useQuery({
    queryKey: ["creatives", adsetId, date],
    queryFn: async (): Promise<FbCreativeEntity[]> => {
      if (!adsetId) return [];
      const res = await api.adsets.creatives(adsetId, date);
      return res.data ?? [];
    },
    enabled: status === "auth" && !!adsetId && enabled,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}
