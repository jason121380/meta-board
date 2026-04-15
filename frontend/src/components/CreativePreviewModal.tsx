import { useHiresThumbnail } from "@/api/hooks/useHiresThumbnail";
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
 * Two visual flavours — the layout branches on whether the ad is a
 * **front-stage post** (re-uses an existing organic FB/IG post) or a
 * **back-stage post** (authored inline in Ads Manager as a dark post).
 *
 *   ┌── Back-stage (內嵌廣告) ─────────────┐
 *   │ [avatar] Page name · 贊助 · Facebook │
 *   │                                      │
 *   │   [查看廣告貼文 →]  ← orange-outline  │  ← MOVED TO TOP
 *   │                                      │
 *   │   [image / video]                    │
 *   │   creative body text...              │
 *   └──────────────────────────────────────┘
 *
 *   ┌── Front-stage success (hi-res ok) ──┐
 *   │ [avatar] Page name · 贊助 · Facebook │
 *   │   [image / video]                    │
 *   │   creative body text...              │
 *   │   [在 Facebook 開啟原始貼文 ↗]        │
 *   └──────────────────────────────────────┘
 *
 *   ┌── Front-stage fallback (hi-res fail)┐
 *   │ [avatar] Page name · 贊助 · Facebook │
 *   │ ┌──────────────────────────────────┐│
 *   │ │  ▓▓ blurry 120px thumb ▓▓        ││
 *   │ │      [在 Facebook 查看原始貼文]   ││  ← semi-transparent
 *   │ │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ││    black overlay
 *   │ └──────────────────────────────────┘│    + centered button
 *   │   creative body text...              │
 *   └──────────────────────────────────────┘
 *
 * Media fallback chain (front-stage only):
 *   1. usePostMedia  → full-res post image / playable video source
 *      (requires pages_read_engagement on the token — typically fails)
 *   2. useHiresThumbnail → 600px server-rendered thumbnail via the
 *      creative edge (reliably available, just softer)
 *   3. blurry thumbnail_url (~120px) + black overlay + CTA button
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

  const isFrontPost = creative?.creative ? isFrontPostCreative(creative.creative) : false;

  // Media fallback for front-stage posts — see file header.
  // 1. Try to read the underlying post directly
  const postMediaQuery = usePostMedia(storyId, isOpen && isFrontPost);
  const postImage = postMediaQuery.data?.image_url ?? null;
  const postVideoSource = postMediaQuery.data?.video_source ?? null;
  const postMediaResolved = !postMediaQuery.isLoading && !postMediaQuery.isPending;

  // 2. If post fetch resolved without a usable image/video, request
  //    the 600px creative-edge thumbnail as a fallback. This path
  //    doesn't need pages_read_engagement — it uses the same
  //    ads_read scope that the rest of the dashboard uses, so it
  //    almost always succeeds.
  const needsHires = isFrontPost && postMediaResolved && !postImage && !postVideoSource;
  const creativeId = creative?.creative?.id ?? null;
  const hiresQuery = useHiresThumbnail(creativeId, isOpen && needsHires, 600);
  const hiresUrl = hiresQuery.data?.thumbnail_url ?? null;
  const hiresResolved = !needsHires || (!hiresQuery.isLoading && !hiresQuery.isPending);

  const thumb = creative?.creative?.thumbnail_url;
  // 3. Preview image priority: full-res post > 600px hires > inline
  //    image_url (back-stage only) > 120px row thumbnail (last resort)
  const previewImage = postImage ?? hiresUrl ?? creative?.creative?.image_url ?? thumb;
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

  // Front-stage: hi-res completely failed → fall back to the blurry
  // 120px thumb with a dark overlay + "view original" CTA so the
  // user still has something meaningful to click.
  const hiResFailed =
    isFrontPost &&
    postMediaResolved &&
    hiresResolved &&
    !postImage &&
    !postVideoSource &&
    !hiresUrl &&
    !!thumb;

  // Header display fields — prefer the real page name/avatar for FB
  // posts. For IG posts we can't pull the account name from the
  // Marketing API, so we show a generic "Instagram" label. For FB
  // posts where usePageInfo returned null (typically pages scope
  // missing) we still fall back to the ad name so the header never
  // reads blank.
  const headerName = pageQuery.data?.name ?? (igPostUrl ? "Instagram" : (creative?.name ?? ""));
  const headerAvatar = pageQuery.data?.picture_url ?? null;
  const headerSubtitle = postPlatform ? `贊助 · ${postPlatform}` : "贊助 · 廣告";

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
            <div className="text-[11px] font-normal text-gray-300">{headerSubtitle}</div>
          </div>
        </div>
      }
      width={520}
    >
      {creative && (
        <div className="flex flex-col gap-3">
          {/* Back-stage (dark-post) layout: "查看廣告貼文" button at
              the top in an orange-outline ghost style. Only shown for
              non-front-stage creatives that actually have a resolvable
              post URL. */}
          {!isFrontPost && postUrl && (
            <a
              href={postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 self-start rounded-pill border-[1.5px] border-orange bg-white px-4 py-1.5 text-[12px] font-semibold text-orange transition hover:bg-orange-bg active:scale-[0.98]"
            >
              查看廣告貼文
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
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

          <MediaBlock
            creativeName={creative.name}
            videoId={videoId}
            videoQueryLoading={videoQuery.isLoading || videoQuery.isPending}
            videoSource={videoQuery.data?.source ?? null}
            videoPicture={videoQuery.data?.picture ?? null}
            videoPoster={videoPoster ?? null}
            isFrontPost={isFrontPost}
            postMediaLoading={postMediaQuery.isLoading || postMediaQuery.isPending}
            hiresLoading={hiresQuery.isLoading || hiresQuery.isFetching}
            needsHires={needsHires}
            postVideoSource={postVideoSource}
            previewImage={previewImage ?? null}
            hiResFailed={hiResFailed}
            thumb={thumb ?? null}
            postUrl={postUrl}
            postPlatform={postPlatform}
          />

          {creativeBody && (
            <p className="w-full whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
              {creativeBody}
            </p>
          )}

          {/* Front-stage success: keep the existing bottom link so
              the user can still jump to the organic source. In the
              hi-res FAILED case the MediaBlock already renders an
              on-image CTA, so we skip the bottom link to avoid
              duplicating the call-to-action. */}
          {isFrontPost && !hiResFailed && postUrl && postPlatform && (
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
 *   2. Front-stage: post-media OR hires-thumbnail still loading
 *   3. Front-stage video post (underlying post exposed a source)
 *   4. Front-stage hi-res FAILED — blurry thumb + dark overlay + CTA
 *   5. Any still image — postImage > hiresUrl > inline image_url > thumb
 *   6. Fallback "無預覽素材" placeholder
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
  hiresLoading: boolean;
  needsHires: boolean;
  postVideoSource: string | null;
  previewImage: string | null;
  hiResFailed: boolean;
  thumb: string | null;
  postUrl: string | null;
  postPlatform: "Facebook" | "Instagram" | null;
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
    hiresLoading,
    needsHires,
    postVideoSource,
    previewImage,
    hiResFailed,
    thumb,
    postUrl,
    postPlatform,
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

  // Front-stage post still resolving — show a spinner while either
  // the post-media OR the hires-thumbnail fallback query is in flight.
  if (isFrontPost && (postMediaLoading || (needsHires && hiresLoading))) {
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
        poster={previewImage ?? videoPoster ?? undefined}
        className="max-h-[70vh] w-full rounded-lg border border-border bg-black"
      >
        您的瀏覽器不支援 HTML5 video。
      </video>
    );
  }

  // Front-stage post, both hi-res paths exhausted, but we still have
  // the tiny 120px row icon. Render it filling the 520px modal,
  // knowingly blurry, and overlay a dark scrim with a centered CTA
  // that sends the user to the organic post for the real thing.
  if (hiResFailed && thumb && postUrl && postPlatform) {
    return (
      <div className="relative w-full overflow-hidden rounded-lg border border-border bg-black">
        <img
          src={thumb}
          alt={creativeName}
          loading="lazy"
          decoding="async"
          // filter: blur softens the pixelation from stretching 120px
          // to 520px so the overlay still looks intentional instead
          // of broken.
          className="block max-h-[70vh] w-full object-contain blur-[1.5px]"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/45">
          <a
            href={postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-pill bg-white/95 px-4 py-2 text-[13px] font-semibold text-ink shadow-md backdrop-blur hover:bg-white active:scale-[0.98]"
          >
            在 {postPlatform} 查看原始貼文
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      </div>
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
