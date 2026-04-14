import { api } from "@/api/client";
import { useFbAuth } from "@/auth/FbAuthProvider";
import { useQuery } from "@tanstack/react-query";

/**
 * Lazy-fetch a FB Page's display name + profile picture.
 *
 * The 3rd-level creative preview modal calls this with the page id
 * it extracts from `creative.effective_object_story_id`
 * (`"{pageId}_{postId}"`) and `enabled=previewOpen`, so the network
 * request only fires when the user actually opens a preview.
 *
 * Page name + avatar rarely change, so we keep the data around for
 * an hour — opening multiple previews in a session won't re-fetch
 * the same page info every time.
 */
export function usePageInfo(pageId: string | null | undefined, enabled: boolean) {
  const { status } = useFbAuth();
  return useQuery({
    queryKey: ["page-info", pageId],
    queryFn: async () => {
      if (!pageId) return null;
      return api.pages.info(pageId);
    },
    enabled: status === "auth" && !!pageId && enabled,
    staleTime: 60 * 60_000,
    // The backend swallows errors into null fields, so a hard
    // failure here would only come from a network blip — let
    // React Query retry once per its default.
  });
}
