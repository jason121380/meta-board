import { useVideoSource } from "@/api/hooks/useVideoSource";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { fbPostLinkFromStoryId } from "@/lib/fbLinks";
import type { FbCreativeEntity } from "@/types/fb";

/**
 * Preview modal for a 3rd-level ad creative. Shared by the Dashboard
 * tree (CreativeRow) and the Creative Center (素材中心) flat table so
 * both views render exactly the same preview behavior.
 *
 * Video creatives are lazy-resolved via useVideoSource — the hook
 * only fires when `creative !== null` so we don't pay the per-row
 * FB round-trip for videos the user never opens.
 *
 * Fallback chain:
 *   1. video_id present → <video> with FB signed source
 *   2. video source unavailable → <img> with video poster
 *   3. no video → <img> with image_url (full-res) or thumbnail_url
 */

export interface CreativePreviewModalProps {
  /** When non-null, the modal is open and shows this creative. */
  creative: FbCreativeEntity | null;
  onClose: () => void;
}

export function CreativePreviewModal({ creative, onClose }: CreativePreviewModalProps) {
  const videoId = creative?.creative?.object_story_spec?.video_data?.video_id ?? null;
  const videoQuery = useVideoSource(videoId, creative !== null);

  const thumb = creative?.creative?.thumbnail_url;
  const previewImage = creative?.creative?.image_url ?? thumb;
  const videoPoster =
    creative?.creative?.object_story_spec?.video_data?.image_url ?? previewImage;
  const creativeTitle = creative?.creative?.title;
  const creativeBody = creative?.creative?.body;
  // IG permalink takes priority since it's explicit and direct;
  // otherwise try to resolve a FB post link from
  // effective_object_story_id. Used to render the "open original
  // post" row because the Marketing API thumbnails are already
  // compressed — the only way to see the real asset is on FB/IG.
  const igPostUrl = creative?.creative?.instagram_permalink_url ?? null;
  const fbPostUrl = igPostUrl
    ? null
    : fbPostLinkFromStoryId(creative?.creative?.effective_object_story_id);
  const postUrl = igPostUrl ?? fbPostUrl;
  const postPlatform: "Instagram" | "Facebook" | null = igPostUrl
    ? "Instagram"
    : fbPostUrl
      ? "Facebook"
      : null;

  return (
    <Modal
      open={creative !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={creative?.name ?? ""}
      subtitle={creativeTitle}
      width={520}
    >
      {creative && (
        <div className="flex flex-col items-center gap-3">
          {videoId ? (
            videoQuery.isLoading || videoQuery.isPending ? (
              <div className="flex min-h-[240px] w-full items-center justify-center rounded-lg border border-border bg-bg">
                <Spinner size={24} />
              </div>
            ) : videoQuery.data?.source ? (
              // biome-ignore lint/a11y/useMediaCaption: FB ad videos
              // have no caption track available via the Graph API.
              <video
                controls
                autoPlay
                playsInline
                src={videoQuery.data.source}
                poster={videoQuery.data.picture ?? videoPoster ?? undefined}
                className="max-h-[70vh] w-full rounded-lg border border-border bg-black"
              >
                您的瀏覽器不支援 HTML5 video。
              </video>
            ) : (
              <img
                src={videoPoster ?? ""}
                alt={creative.name}
                loading="lazy"
                decoding="async"
                className="max-h-[70vh] w-full rounded-lg border border-border object-contain"
              />
            )
          ) : previewImage ? (
            <img
              src={previewImage}
              alt={creative.name}
              loading="lazy"
              decoding="async"
              className="max-h-[70vh] w-full rounded-lg border border-border object-contain"
            />
          ) : (
            <div className="flex min-h-[200px] w-full items-center justify-center rounded-lg border border-border bg-bg text-xs text-gray-300">
              無預覽素材
            </div>
          )}
          {creativeBody && (
            <p className="w-full whitespace-pre-wrap text-[13px] leading-relaxed text-gray-500">
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
