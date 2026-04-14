import { api } from "@/api/client";
import { useFbAuth } from "@/auth/FbAuthProvider";
import { useQuery } from "@tanstack/react-query";

/**
 * Lazy-fetch the playable source URL + poster for a FB video asset.
 *
 * The 3rd-level creative preview modal calls this hook with the
 * `video_id` pulled from `creative.object_story_spec.video_data.video_id`
 * and `enabled=previewOpen`, so we only pay the extra FB round-trip
 * when the user actually opens the modal — not on every tree
 * expansion.
 *
 * FB signed video source URLs are long-lived but not forever, so a
 * 30-minute stale time keeps repeated opens instant without risking
 * a dead link on stale data.
 */
export function useVideoSource(videoId: string | null | undefined, enabled: boolean) {
  const { status } = useFbAuth();
  return useQuery({
    queryKey: ["video", videoId],
    queryFn: async () => {
      if (!videoId) return null;
      return api.videos.source(videoId);
    },
    enabled: status === "auth" && !!videoId && enabled,
    staleTime: 30 * 60_000,
  });
}
