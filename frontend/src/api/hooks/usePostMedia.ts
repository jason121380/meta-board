import { api } from "@/api/client";
import { useFbAuth } from "@/auth/FbAuthProvider";
import { useQuery } from "@tanstack/react-query";

/**
 * Lazy-fetch the full-resolution media (image / video source) for
 * a FB page post, keyed on its id (typically `{pageId}_{postId}`).
 *
 * Used by the 3rd-level creative preview modal when the ad is a
 * "front-stage post" (reuses an organic FB post). In that case the
 * creative endpoint doesn't return `image_url` or `video_data`, so
 * the modal would otherwise show a blurry compressed thumbnail and
 * be unable to play video ads at all. Fetching the post directly
 * gives us the real CDN URLs from the underlying organic post.
 *
 * Only enabled while the modal is open, and only for post ids that
 * look like valid page-post handles (`{digits}_{digits}`). Cached
 * for 30 minutes — post media rarely changes once published.
 */
export function usePostMedia(postId: string | null | undefined, enabled: boolean) {
  const { status } = useFbAuth();
  return useQuery({
    queryKey: ["post-media", postId],
    queryFn: async () => {
      if (!postId) return null;
      return api.posts.media(postId);
    },
    enabled: status === "auth" && !!postId && enabled,
    staleTime: 30 * 60_000,
  });
}
