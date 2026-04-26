import { useAdsets } from "@/api/hooks/useAdsets";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toast";
import type { DateConfig } from "@/lib/datePicker";
import { toLabel } from "@/lib/datePicker";
import { buildShareUrl } from "@/lib/shareReport";
import type { FbCampaign } from "@/types/fb";
import { useState } from "react";
import { ReportContent } from "./ReportContent";

/**
 * Campaign report modal — summary + adset breakdown for a single
 * campaign, with:
 *   - 不顯示金額 toggle (top-right, default ON)
 *   - 複製分享連結 button (bottom) that copies a /r/:campaignId URL
 *     and opens it in a new tab
 *
 * The share link encodes only the campaign id + account id + hide
 * flag + date preset. The public page re-fetches live data on load.
 */
export function ReportModal({
  open,
  onOpenChange,
  campaign,
  date,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campaign: FbCampaign | null;
  date: DateConfig;
}) {
  const [hideMoney, setHideMoney] = useState(true);

  const adsetsQuery = useAdsets(campaign?.id ?? null, date, open && !!campaign);

  if (!campaign) return null;

  const onShare = async () => {
    const url = buildShareUrl({
      campaignId: campaign.id,
      accountId: campaign._accountId ?? "",
      hideMoney,
      datePreset: date.preset !== "custom" ? date.preset : undefined,
    });
    try {
      await navigator.clipboard.writeText(url);
      toast("已複製分享連結", "success", 2500);
    } catch {
      /* clipboard write can fail on insecure contexts / iframes */
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="行銷活動報告"
      subtitle={toLabel(date)}
      titleAction={
        <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[12px] text-gray-500">
          <input
            type="checkbox"
            className="custom-cb"
            checked={hideMoney}
            onChange={(e) => setHideMoney(e.currentTarget.checked)}
          />
          不顯示金額
        </label>
      }
      width={780}
      footer={
        <Button variant="primary" size="sm" onClick={onShare}>
          複製分享連結
        </Button>
      }
    >
      <ReportContent
        campaign={campaign}
        adsets={adsetsQuery.data ?? null}
        adsetsLoading={adsetsQuery.isLoading || adsetsQuery.isPending}
        adsetsError={adsetsQuery.error instanceof Error ? adsetsQuery.error.message : null}
        hideMoney={hideMoney}
        dateLabel={toLabel(date)}
        date={date}
      />
    </Modal>
  );
}
