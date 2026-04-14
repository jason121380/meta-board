import { useVideoSource } from "@/api/hooks/useVideoSource";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
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
                className="max-h-[70vh] w-full rounded-lg border border-border object-contain"
              />
            )
          ) : previewImage ? (
            <img
              src={previewImage}
              alt={creative.name}
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
        </div>
      )}
    </Modal>
  );
}
