import { useEntityStatusMutation } from "@/api/hooks/useEntityMutations";
import { Badge } from "@/components/Badge";
import { confirm } from "@/components/ConfirmDialog";
import { Toggle } from "@/components/Toggle";
import { isFrontPostCreative } from "@/lib/fbLinks";
import { fM, fN, fP } from "@/lib/format";
import { getIns, getMsgCount } from "@/lib/insights";
import type { FbCreativeEntity } from "@/types/fb";
import { Suspense, lazy, memo, useState } from "react";

// The preview modal pulls in <video>, usePostMedia, usePageInfo, and
// FB-post-style header rendering — ~5KB of JS + its own query hooks.
// It only opens when the user actually clicks a creative row, so we
// don't want to ship it in the Dashboard first-paint bundle. Lazy-
// loading keeps the tree render path lean.
const CreativePreviewModal = lazy(() =>
  import("@/components/CreativePreviewModal").then((m) => ({
    default: m.CreativePreviewModal,
  })),
);

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

function CreativeRowInner({ creative, multiAcct }: CreativeRowProps) {
  const ins = getIns(creative);
  const msgs = getMsgCount(creative);
  const spend = Number(ins.spend) || 0;
  const mutation = useEntityStatusMutation();
  const thumb = creative.creative?.thumbnail_url;
  const isFrontPost = creative.creative ? isFrontPostCreative(creative.creative) : false;
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
                loading="lazy"
                decoding="async"
                className="h-[30px] w-[30px] shrink-0 rounded-sm border border-border object-cover"
              />
            ) : (
              <div className="h-[30px] w-[30px] shrink-0 rounded-sm bg-bg" />
            )}
            <span className="truncate text-[13px] font-normal text-gray-500" title={creative.name}>
              {creative.name}
            </span>
            {isFrontPost && (
              <span
                className="shrink-0 rounded-full bg-[#E3F2FD] px-1.5 py-[1px] text-[10px] font-semibold text-[#1565C0]"
                title="這支廣告是從既有的 FB/IG 貼文建立"
              >
                前台貼文
              </span>
            )}
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
      {previewOpen && (
        <Suspense fallback={null}>
          <CreativePreviewModal creative={creative} onClose={() => setPreviewOpen(false)} />
        </Suspense>
      )}
    </>
  );
}

/**
 * Exported memoised wrapper. The creative prop is stable across
 * re-renders of the parent <AdsetRow/> (it comes from React Query's
 * cached array), so `memo` short-circuits 95%+ of tree renders when
 * the user sorts / filters / toggles expansion elsewhere in the tree.
 */
export const CreativeRow = memo(CreativeRowInner);
