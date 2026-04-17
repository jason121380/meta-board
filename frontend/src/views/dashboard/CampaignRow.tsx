import { useAccounts } from "@/api/hooks/useAccounts";
import { useAdsets } from "@/api/hooks/useAdsets";
import { useEntityStatusMutation } from "@/api/hooks/useEntityMutations";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { confirm } from "@/components/ConfirmDialog";
import { FbCampaignLink } from "@/components/FbCampaignLink";
import { Spinner } from "@/components/Spinner";
import { Toggle } from "@/components/Toggle";
import type { DateConfig } from "@/lib/datePicker";
import { fM, fN, fP } from "@/lib/format";
import { getIns, getMsgCount } from "@/lib/insights";
import { useUiStore } from "@/stores/uiStore";
import type { FbCampaign } from "@/types/fb";
import { memo } from "react";
import { AdsetRow } from "./AdsetRow";
import type { BudgetModalTarget } from "./BudgetModal";

export interface CampaignRowProps {
  campaign: FbCampaign;
  index: number;
  multiAcct: boolean;
  colCount: number;
  date: DateConfig;
  onOpenBudget: (target: BudgetModalTarget) => void;
}

/**
 * First-level row — a single FB campaign with lazy-loaded adsets
 * inside an expanded state. Matches the original design lines 1971–2003.
 *
 * Budget column shows either daily_budget or lifetime_budget; if
 * neither is set we display a hint that the budget lives on the
 * adset level (matches legacy `budgetStr(camp, true)`).
 *
 * `React.memo`-wrapped at the bottom of this file. The parent
 * `TreeTable` passes a stable `onOpenBudget` (wrapped in
 * `useCallback` inside `DashboardView`), and `campaign` itself is
 * the same object reference across renders while the cached
 * overview data is unchanged — so the memo short-circuits row
 * re-renders during sort / filter / unrelated expansion.
 */
function CampaignRowInner({
  campaign,
  index,
  multiAcct,
  colCount,
  date,
  onOpenBudget,
}: CampaignRowProps) {
  const expanded = useUiStore((s) => s.expandedCamps.includes(campaign.id));
  const toggleCamp = useUiStore((s) => s.toggleCamp);
  const adsetsQuery = useAdsets(campaign.id, date, expanded);
  const mutation = useEntityStatusMutation();
  const accountsQuery = useAccounts();
  const businessId = accountsQuery.data?.find((a) => a.id === campaign._accountId)?.business?.id;

  const ins = getIns(campaign);
  const msgs = getMsgCount(campaign);
  const spend = Number(ins.spend) || 0;

  const onRowClick = () => toggleCamp(campaign.id);

  const onToggleStatus = async (nextChecked: boolean) => {
    const status = nextChecked ? "ACTIVE" : "PAUSED";
    const action = nextChecked ? "開啟" : "暫停";
    const ok = await confirm(`確定要${action}此行銷活動？`);
    if (!ok) return;
    try {
      await mutation.mutateAsync({ kind: "campaign", id: campaign.id, status });
    } catch {
      /* query refetch handles revert */
    }
  };

  const budgetText = campaign.daily_budget
    ? `日 $${fM(campaign.daily_budget)}`
    : campaign.lifetime_budget
      ? `總 $${fM(campaign.lifetime_budget)}`
      : null;

  return (
    <>
      <tr
        className="campaign-row cursor-pointer"
        data-camp={campaign.id}
        onClick={onRowClick}
        aria-expanded={expanded}
      >
        <td className="w-10 text-center text-xs text-gray-300">{index + 1}</td>
        <td>
          <div className="flex max-w-[260px] items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-[10px] text-ink"
            >
              {expanded ? "▼" : "▶"}
            </span>
            <span
              className="min-w-0 flex-1 truncate text-[13px] font-semibold"
              title={campaign.name}
            >
              {campaign.name}
            </span>
            <FbCampaignLink
              campaignId={campaign.id}
              accountId={campaign._accountId}
              campaignName={campaign.name}
              businessId={businessId}
            />
          </div>
        </td>
        {multiAcct && (
          <td>
            <span className="text-[11px] text-gray-500">{campaign._accountName}</span>
          </td>
        )}
        <td>
          <Badge status={campaign.status} />
        </td>
        <td className="num">{fM(ins.spend)}</td>
        <td className="num">{fN(ins.impressions)}</td>
        <td className="num">{fN(ins.clicks)}</td>
        <td className="num">{fP(ins.ctr)}</td>
        <td className="num">{fM(ins.cpc)}</td>
        <td className="num">{msgs > 0 ? fN(msgs) : "—"}</td>
        <td className="num">{msgs > 0 ? `$${fM(spend / msgs)}` : "—"}</td>
        <td className="num whitespace-nowrap">
          {budgetText ?? <span className="text-[11px] text-orange-muted">廣告組合預算</span>}
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1.5">
            <Toggle
              checked={campaign.status === "ACTIVE"}
              onChange={(e) => {
                void onToggleStatus(e.currentTarget.checked);
              }}
            />
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-1 text-[12px] text-gray-500 hover:text-orange outline-none"
              onClick={() =>
                onOpenBudget({ kind: "campaign", id: campaign.id, name: campaign.name })
              }
            >
              調整預算
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <CampaignAdsets
          query={adsetsQuery}
          colCount={colCount}
          multiAcct={multiAcct}
          date={date}
          onOpenBudget={onOpenBudget}
        />
      )}
    </>
  );
}

export const CampaignRow = memo(CampaignRowInner);

function CampaignAdsets({
  query,
  colCount,
  multiAcct,
  date,
  onOpenBudget,
}: {
  query: ReturnType<typeof useAdsets>;
  colCount: number;
  multiAcct: boolean;
  date: DateConfig;
  onOpenBudget: (target: BudgetModalTarget) => void;
}) {
  if (query.isLoading || query.isPending) {
    return (
      <tr className="adset-row">
        <td colSpan={colCount}>
          <div className="flex items-center gap-2 py-3 pl-6 text-xs text-gray-300">
            <Spinner size={14} /> 載入廣告組合...
          </div>
        </td>
      </tr>
    );
  }
  if (query.isError) {
    return (
      <tr className="adset-row">
        <td colSpan={colCount}>
          <div className="py-3 pl-6 text-xs text-red">
            載入廣告組合失敗：{query.error instanceof Error ? query.error.message : "未知錯誤"}
          </div>
        </td>
      </tr>
    );
  }
  const data = query.data ?? [];
  if (data.length === 0) {
    return (
      <tr className="adset-row">
        <td colSpan={colCount}>
          <div className="py-3 pl-12 text-xs text-gray-300">無廣告組合</div>
        </td>
      </tr>
    );
  }
  return (
    <>
      {data.map((adset) => (
        <AdsetRow
          key={adset.id}
          adset={adset}
          multiAcct={multiAcct}
          colCount={colCount}
          date={date}
          onOpenBudget={onOpenBudget}
        />
      ))}
    </>
  );
}
