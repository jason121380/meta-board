import { usePageInfo } from "@/api/hooks/usePageInfo";
import { usePostMedia } from "@/api/hooks/usePostMedia";
import { useVideoSource } from "@/api/hooks/useVideoSource";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { fbPostLinkFromStoryId, isFrontPostCreative } from "@/lib/fbLinks";
import type { FbCreativeEntity } from "@/types/fb";

/**
 * Preview modal for a 3rd-level ad creative. Rendered from the
 * Dashboard tree (CreativeRow) whenever the user clicks an ad row.
 *
 * Visual design: mimics a real FB / IG post so the user sees the
 * creative in the context it will appear in-feed, not as a bare
 * thumbnail.
 *
 *   ┌──────────────────────────────────┐
 *   │ [avatar] Page name     · 贊助 ×  │  ← sticky header (via Modal)
 *   ├──────────────────────────────────┤
 *   │                                  │
 *   │        [image / video]           │
 *   │                                  │
 *   ├──────────────────────────────────┤
 *   │ creative body text...            │
 *   │                                  │
 *   │ [在 FB/IG 開啟原始貼文 ↗]        │
 *   └──────────────────────────────────┘
 *
 * Lazy fetches (both only run while the modal is open):
 *   - useVideoSource → playable video source + poster
 *   - usePageInfo    → FB Page name + avatar, keyed on the pageId
 *                      extracted from effective_object_story_id
 *
 * Fallback chain for the media block:
 *   1. video_id present → <video> with FB signed source
 *   2. video source unavailable → <img> with video poster
 *   3. no video → <img> with image_url (full-res) or thumbnail_url
 *   4. nothing usable → "無預覽素材" placeholder
 */

export interface CreativePreviewModalProps {
  /** When non-null, the modal is open and shows this creative. */
  creative: FbCreativeEntity | null;
  onClose: () => void;
}

/** Pull `pageId` out of `effective_object_story_id` = `"{pageId}_{postId}"`. */
function extractPageId(storyId: string | undefined): string | null {
  if (!storyId) return null;
  const i = storyId.indexOf("_");
  if (i <= 0) return null;
  return storyId.slice(0, i);
}

export function CreativePreviewModal({ creative, onClose }: CreativePreviewModalProps) {
  const isOpen = creative !== null;
  const videoId = creative?.creative?.object_story_spec?.video_data?.video_id ?? null;
  const videoQuery = useVideoSource(videoId, isOpen);

  const storyId = creative?.creative?.effective_object_story_id;
  const pageId = extractPageId(storyId);
  const pageQuery = usePageInfo(pageId, isOpen);

  // Front-stage posts (ads built from an existing organic FB post)
  // don't expose image_url or video_data on the creative object, so
  // the only thing the ad edge gives us is a blurry ~120px thumbnail
  // and no playable video handle. For those ads we fetch the
  // underlying post directly via /api/posts/{post_id}/media, which
  // returns the full-resolution image CDN URL and (for video posts)
  // a playable source URL. Only fires while the modal is open AND
  // the creative actually looks like a front-stage post, so inline
  // ads never pay the extra round-trip.
  const isFrontPost = creative?.creative ? isFrontPostCreative(creative.creative) : false;
  const postMediaQuery = usePostMedia(storyId, isOpen && isFrontPost);

  const thumb = creative?.creative?.thumbnail_url;
  const postImage = postMediaQuery.data?.image_url ?? null;
  const postVideoSource = postMediaQuery.data?.video_source ?? null;
  // Prefer the full-res underlying-post image when available, then
  // fall back to the inline-authored image_url, then the small
  // thumbnail as a last resort.
  const previewImage = postImage ?? creative?.creative?.image_url ?? thumb;
  const videoPoster = creative?.creative?.object_story_spec?.video_data?.image_url ?? previewImage;
  const creativeBody = creative?.creative?.body;

  // IG permalink takes priority since it's explicit and direct;
  // otherwise build a FB post link from effective_object_story_id.
  const igPostUrl = creative?.creative?.instagram_permalink_url ?? null;
  const fbPostUrl = igPostUrl ? null : fbPostLinkFromStoryId(storyId);
  const postUrl = igPostUrl ?? fbPostUrl;
  const postPlatform: "Instagram" | "Facebook" | null = igPostUrl
    ? "Instagram"
    : fbPostUrl
      ? "Facebook"
      : null;

  // Header display fields — prefer the real page name/avatar for FB
  // posts. For IG posts we can't pull the account name from the
  // Marketing API, so we show a generic "Instagram" label.
  const headerName = pageQuery.data?.name ?? (igPostUrl ? "Instagram" : (creative?.name ?? ""));
  const headerAvatar = pageQuery.data?.picture_url ?? null;

  return (
    <Modal
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={
        <div className="flex min-w-0 items-center gap-2.5">
          {headerAvatar ? (
            <img
              src={headerAvatar}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-10 w-10 shrink-0 rounded-full border border-border object-cover"
            />
          ) : igPostUrl ? (
            // Instagram fallback avatar — generic IG camera glyph
            // on a subtle gradient so IG-sourced creatives still get
            // a recognisable header.
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#FEDA77] via-[#F58529] to-[#DD2A7B] text-white">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="2" y="2" width="20" height="20" rx="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
            </div>
          ) : (
            <div className="h-10 w-10 shrink-0 rounded-full bg-bg" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold leading-tight text-ink">
              {headerName}
            </div>
            <div className="text-[11px] font-normal text-gray-300">贊助 · 廣告</div>
          </div>
        </div>
      }
      width={520}
    >
      {creative && (
        <div className="flex flex-col gap-3">
          <MediaBlock
            creativeName={creative.name}
            videoId={videoId}
            videoQueryLoading={videoQuery.isLoading || videoQuery.isPending}
            videoSource={videoQuery.data?.source ?? null}
            videoPicture={videoQuery.data?.picture ?? null}
            videoPoster={videoPoster ?? null}
            isFrontPost={isFrontPost}
            postMediaLoading={postMediaQuery.isLoading || postMediaQuery.isPending}
            postVideoSource={postVideoSource}
            postImage={postImage}
            previewImage={previewImage ?? null}
          />

          {creativeBody && (
            <p className="w-full whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
              {creativeBody}
            </p>
          )}
          {postUrl && postPlatform && (
            <a
              href={postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 self-start rounded-pill border-[1.5px] border-border bg-white px-3 py-1.5 text-[12px] font-medium text-gray-500 hover:border-orange-border hover:bg-orange-bg hover:text-orange active:scale-[0.98]"
            >
              在 {postPlatform} 開啟原始貼文
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          )}
        </div>
      )}
    </Modal>
  );
}

/**
 * Internal helper that renders just the image / video block of the
 * preview modal. Kept as a named function (not an IIFE) so biome's
 * useMediaCaption suppression comment can sit directly adjacent to
 * the `<video>` JSX element — biome doesn't attach suppressions that
 * cross a `return (` boundary inside an IIFE.
 *
 * Decision order:
 *   1. Inline-authored video (we have a video_id + resolved source)
 *   2. Front-stage post whose media query is still loading
 *   3. Front-stage video post (underlying post exposed a source)
 *   4. Any still image — post-image > inline image_url > thumbnail
 *   5. Fallback "無預覽素材" placeholder
 */
interface MediaBlockProps {
  creativeName: string;
  videoId: string | null;
  videoQueryLoading: boolean;
  videoSource: string | null;
  videoPicture: string | null;
  videoPoster: string | null;
  isFrontPost: boolean;
  postMediaLoading: boolean;
  postVideoSource: string | null;
  postImage: string | null;
  previewImage: string | null;
}

function MediaBlock(props: MediaBlockProps) {
  const {
    creativeName,
    videoId,
    videoQueryLoading,
    videoSource,
    videoPicture,
    videoPoster,
    isFrontPost,
    postMediaLoading,
    postVideoSource,
    postImage,
    previewImage,
  } = props;

  if (videoId) {
    if (videoQueryLoading) {
      return (
        <div className="flex min-h-[240px] w-full items-center justify-center rounded-lg border border-border bg-bg">
          <Spinner size={24} />
        </div>
      );
    }
    if (videoSource) {
      return (
        // biome-ignore lint/a11y/useMediaCaption: FB ad videos have no caption track available via the Graph API.
        <video
          controls
          autoPlay
          playsInline
          src={videoSource}
          poster={videoPicture ?? videoPoster ?? undefined}
          className="max-h-[70vh] w-full rounded-lg border border-border bg-black"
        >
          您的瀏覽器不支援 HTML5 video。
        </video>
      );
    }
    return (
      <img
        src={videoPoster ?? ""}
        alt={creativeName}
        loading="lazy"
        decoding="async"
        className="max-h-[70vh] w-full rounded-lg border border-border object-contain"
      />
    );
  }

  if (isFrontPost && postMediaLoading) {
    return (
      <div className="flex min-h-[240px] w-full items-center justify-center rounded-lg border border-border bg-bg">
        <Spinner size={24} />
      </div>
    );
  }

  if (postVideoSource) {
    return (
      // biome-ignore lint/a11y/useMediaCaption: FB ad videos have no caption track available via the Graph API.
      <video
        controls
        autoPlay
        playsInline
        src={postVideoSource}
        poster={postImage ?? videoPoster ?? undefined}
        className="max-h-[70vh] w-full rounded-lg border border-border bg-black"
      >
        您的瀏覽器不支援 HTML5 video。
      </video>
    );
  }

  if (previewImage) {
    return (
      <img
        src={previewImage}
        alt={creativeName}
        loading="lazy"
        decoding="async"
        className="max-h-[70vh] w-full rounded-lg border border-border object-contain"
      />
    );
  }

  return (
    <div className="flex min-h-[200px] w-full items-center justify-center rounded-lg border border-border bg-bg text-xs text-gray-300">
      無預覽素材
    </div>
  );
}
