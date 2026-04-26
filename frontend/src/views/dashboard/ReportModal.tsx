import { useAdsets } from "@/api/hooks/useAdsets";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toast";
import type { DateConfig } from "@/lib/datePicker";
import { toLabel } from "@/lib/datePicker";
import { buildShareUrl } from "@/lib/shareReport";
import type { FbCampaign } from "@/types/fb";
import { ReportContent } from "./ReportContent";

/**
 * Campaign report modal — summary + adset breakdown for a single
 * campaign. The 不顯示金額 toggle was removed per design feedback;
 * money is always visible in the dashboard view (admins only).
 *
 * Footer has a 複製分享連結 button that copies a /r/:campaignId URL
 * and opens it in a new tab. The public share page re-fetches live
 * data on load.
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
  const adsetsQuery = useAdsets(campaign?.id ?? null, date, open && !!campaign);

  if (!campaign) return null;

  const onShare = async () => {
    const url = buildShareUrl({
      campaignId: campaign.id,
      accountId: campaign._accountId ?? "",
      hideMoney: false,
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
        hideMoney={false}
        dateLabel={toLabel(date)}
        date={date}
      />
    </Modal>
  );
}
