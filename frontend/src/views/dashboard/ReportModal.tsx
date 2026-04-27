import { useAdsets } from "@/api/hooks/useAdsets";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import type { DateConfig } from "@/lib/datePicker";
import { toLabel } from "@/lib/datePicker";
import { buildShareUrl } from "@/lib/shareReport";
import { useFinanceStore } from "@/stores/financeStore";
import type { FbCampaign } from "@/types/fb";
import { markupFor } from "@/views/finance/financeData";
import { useState } from "react";
import { ReportContent } from "./ReportContent";

/**
 * Campaign report modal — summary + adset breakdown for a single
 * campaign.
 *
 * Footer has a 複製分享連結 button that copies a /r/:campaignId URL
 * and opens it in a new tab. The public share page re-fetches live
 * data on load and respects the 花費/花費+% toggle via URL params
 * so the link recipient sees the same view the operator chose.
 *
 * 花費/花費+% mutex toggle:
 *   - 花費   → raw FB spend (default)
 *   - 花費+% → spend × (1 + markup/100), label rendered as 花費* in
 *              the report itself (asterisk hides the actual %)
 *   Markup percent is read live from financeStore (per-row override
 *   wins over the team-wide default).
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
  const rowMarkups = useFinanceStore((s) => s.rowMarkups);
  const defaultMarkup = useFinanceStore((s) => s.defaultMarkup);
  const [useSpendPlus, setUseSpendPlus] = useState(false);

  if (!campaign) return null;

  const markupPercent = markupFor(campaign.id, rowMarkups, defaultMarkup);

  const onShare = async () => {
    const url = buildShareUrl({
      campaignId: campaign.id,
      accountId: campaign._accountId ?? "",
      hideMoney: false,
      datePreset: date.preset !== "custom" ? date.preset : undefined,
      useSpendPlus,
      markupPercent,
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
      {/* 花費 / 花費+% mutex toggle. 影響整份報告 (含分享頁) 的所有
          花費欄位。預覽切換 = 即時更新;按下複製分享連結時當下
          選擇會編碼進 URL,接收者看到的也會是同一份。 */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-[12px] font-semibold text-gray-500">花費顯示</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setUseSpendPlus(false)}
            aria-pressed={!useSpendPlus}
            className={cn(
              "h-7 rounded-full border px-3 text-[11px] font-semibold transition",
              !useSpendPlus
                ? "border-orange bg-orange-bg text-orange"
                : "border-border bg-white text-gray-500 hover:border-orange",
            )}
          >
            花費
          </button>
          <button
            type="button"
            onClick={() => setUseSpendPlus(true)}
            aria-pressed={useSpendPlus}
            className={cn(
              "h-7 rounded-full border px-3 text-[11px] font-semibold transition",
              useSpendPlus
                ? "border-orange bg-orange-bg text-orange"
                : "border-border bg-white text-gray-500 hover:border-orange",
            )}
          >
            花費+{markupPercent}%
          </button>
        </div>
      </div>

      <ReportContent
        campaign={campaign}
        adsets={adsetsQuery.data ?? null}
        adsetsLoading={adsetsQuery.isLoading || adsetsQuery.isPending}
        adsetsError={adsetsQuery.error instanceof Error ? adsetsQuery.error.message : null}
        hideMoney={false}
        dateLabel={toLabel(date)}
        date={date}
        useSpendPlus={useSpendPlus}
        markupPercent={markupPercent}
      />
    </Modal>
  );
}
