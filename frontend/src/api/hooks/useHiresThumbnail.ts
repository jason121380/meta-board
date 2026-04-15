import { api } from "@/api/client";
import { useFbAuth } from "@/auth/FbAuthProvider";
import { useQuery } from "@tanstack/react-query";

/**
 * Lazy-fetch a larger server-rendered thumbnail for a single
 * AdCreative. Used by the 3rd-level preview modal as a graceful
 * fallback when `usePostMedia` fails — typically because the user
 * token lacks `pages_read_engagement` and we can't read the
 * underlying Page post to get its `full_picture`.
 *
 * The 600px version is still a server-side preview (not the
 * original source asset), so it CAN look soft on high-DPR screens
 * — but it's ~25× larger than the 120px row icon, and almost
 * always acceptable at modal scale.
 *
 * Only enabled while the modal is open AND the creative has an
 * `id` we can send to the endpoint. Cache keyed by creative id +
 * size so re-opens are instant.
 */
export function useHiresThumbnail(
  creativeId: string | null | undefined,
  enabled: boolean,
  size = 600,
) {
  const { status } = useFbAuth();
  return useQuery({
    queryKey: ["hires-thumbnail", creativeId, size],
    queryFn: async () => {
      if (!creativeId) return null;
      return api.creatives.hiresThumbnail(creativeId, size);
    },
    enabled: status === "auth" && !!creativeId && enabled,
    staleTime: 30 * 60_000,
  });
}
