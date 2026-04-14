import { useEntityStatusMutation } from "@/api/hooks/useEntityMutations";
import { Badge } from "@/components/Badge";
import { confirm } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";
import { Toggle } from "@/components/Toggle";
import { fM, fN, fP } from "@/lib/format";
import { getIns, getMsgCount } from "@/lib/insights";
import type { FbCreativeEntity } from "@/types/fb";
import { useState } from "react";

/**
 * Third-level row — a single FB Ad / creative.
 *
 * CRITICAL: the table row MUST use the class `creative-row`, NOT
 * `ad-row`. Ad blockers (uBlock, AdBlock Plus) match `[class^="ad-"]`
 * and set `display: none` on any element whose class starts with
 * `ad-`, which is how we got into the silent-breakage saga that led
 * to commit d720fa2. Enforced by a dedicated eslint-style grep check
 * added in Phase 10.
 */

export interface CreativeRowProps {
  creative: FbCreativeEntity;
  multiAcct: boolean;
}

export function CreativeRow({ creative, multiAcct }: CreativeRowProps) {
  const ins = getIns(creative);
  const msgs = getMsgCount(creative);
  const spend = Number(ins.spend) || 0;
  const mutation = useEntityStatusMutation();
  const thumb = creative.creative?.thumbnail_url;
  // Prefer the full-resolution image_url for the preview modal so
  // the enlarged view isn't blurry. Falls back to thumbnail_url for
  // video / carousel / DPA creatives where image_url is absent.
  const previewImage = creative.creative?.image_url ?? thumb;
  const creativeTitle = creative.creative?.title;
  const creativeBody = creative.creative?.body;
  const [previewOpen, setPreviewOpen] = useState(false);

  const onToggleStatus = async (nextChecked: boolean) => {
    const status = nextChecked ? "ACTIVE" : "PAUSED";
    const action = nextChecked ? "開啟" : "暫停";
    const ok = await confirm(`確定要${action}此廣告？`);
    if (!ok) return;
    try {
      await mutation.mutateAsync({ kind: "creative", id: creative.id, status });
    } catch {
      /* error toast TBD — for now swallow and let the query refetch */
    }
  };

  const canPreview = Boolean(thumb);
  const openPreview = () => {
    if (canPreview) setPreviewOpen(true);
  };

  return (
    <>
      <tr
        className={canPreview ? "creative-row cursor-zoom-in" : "creative-row"}
        onClick={openPreview}
      >
        <td />
        <td>
          <div className="flex max-w-[240px] items-center gap-1.5 pl-[72px]">
            {thumb ? (
              // NOTE: do NOT wrap the URL in escHtml(). The legacy
              // dashboard.html did so because it injected the <img> via
              // innerHTML, where the browser re-parses `&amp;` back to
              // `&`. In React JSX, `src={...}` is an attribute binding,
              // so escHtml would leave `&amp;` literally in the URL and
              // break Facebook's signed CDN URLs (signature mismatch →
              // 403 → broken thumbnail). See the 3rd-level ad thumbnail
              // regression investigated 2026-04-14.
              <img
                src={thumb}
                alt=""
                className="h-[30px] w-[30px] shrink-0 rounded-sm border border-border object-cover"
              />
            ) : (
              <div className="h-[30px] w-[30px] shrink-0 rounded-sm bg-bg" />
            )}
            <span className="truncate text-[13px] font-normal text-gray-500" title={creative.name}>
              {creative.name}
            </span>
          </div>
        </td>
        {multiAcct && <td />}
        <td>
          <Badge status={creative.status} />
        </td>
        <td className="num">{fM(ins.spend)}</td>
        <td className="num">{fN(ins.impressions)}</td>
        <td className="num">{fN(ins.clicks)}</td>
        <td className="num">{fP(ins.ctr)}</td>
        <td className="num">{fM(ins.cpc)}</td>
        <td className="num">{msgs > 0 ? fN(msgs) : "—"}</td>
        <td className="num">{msgs > 0 ? `$${fM(spend / msgs)}` : "—"}</td>
        <td className="muted">—</td>
        <td onClick={(e) => e.stopPropagation()}>
          <Toggle
            checked={creative.status === "ACTIVE"}
            onChange={(e) => {
              void onToggleStatus(e.currentTarget.checked);
            }}
          />
        </td>
      </tr>
      {canPreview && (
        <Modal
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          title={creative.name}
          subtitle={creativeTitle}
          width={520}
        >
          <div className="flex flex-col items-center gap-3">
            <img
              src={previewImage}
              alt={creative.name}
              className="max-h-[70vh] w-full rounded-lg border border-border object-contain"
            />
            {creativeBody && (
              <p className="w-full whitespace-pre-wrap text-[13px] leading-relaxed text-gray-500">
                {creativeBody}
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
