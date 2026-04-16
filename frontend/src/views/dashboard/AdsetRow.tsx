import { useCreatives } from "@/api/hooks/useCreatives";
import { useEntityStatusMutation } from "@/api/hooks/useEntityMutations";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { confirm } from "@/components/ConfirmDialog";
import { Spinner } from "@/components/Spinner";
import { Toggle } from "@/components/Toggle";
import type { DateConfig } from "@/lib/datePicker";
import { fM, fN, fP } from "@/lib/format";
import { getIns, getMsgCount } from "@/lib/insights";
import { useUiStore } from "@/stores/uiStore";
import type { FbAdset } from "@/types/fb";
import { memo } from "react";
import type { BudgetModalTarget } from "./BudgetModal";
import { CreativeRow } from "./CreativeRow";

export interface AdsetRowProps {
  adset: FbAdset;
  multiAcct: boolean;
  colCount: number;
  date: DateConfig;
  onOpenBudget: (target: BudgetModalTarget) => void;
}

/**
 * Second-level row — a single adset.
 *
 * Self-contained fetch behavior: when the user expands this row we
 * call `useCreatives(adsetId, date, true)` which fires the lazy
 * query. React rules-of-hooks are respected because each AdsetRow is
 * its own component with a stable hook order.
 *
 * `React.memo`-wrapped at the bottom — the parent `CampaignRow`
 * passes an `onOpenBudget` handler that's itself stabilised via
 * `useCallback` in `DashboardView`, and the `adset` object stays
 * identity-stable across renders from the React Query cache.
 */
function AdsetRowInner({ adset, multiAcct, colCount, date, onOpenBudget }: AdsetRowProps) {
  const expanded = useUiStore((s) => s.expandedAdsets.includes(adset.id));
  const toggleAdset = useUiStore((s) => s.toggleAdset);
  const creativesQuery = useCreatives(adset.id, date, expanded);
  const mutation = useEntityStatusMutation();

  const ins = getIns(adset);
  const msgs = getMsgCount(adset);
  const spend = Number(ins.spend) || 0;

  const onRowClick = () => toggleAdset(adset.id);

  const onToggleStatus = async (nextChecked: boolean) => {
    const status = nextChecked ? "ACTIVE" : "PAUSED";
    const action = nextChecked ? "開啟" : "暫停";
    const ok = await confirm(`確定要${action}此廣告組合？`);
    if (!ok) return;
    try {
      await mutation.mutateAsync({ kind: "adset", id: adset.id, status });
    } catch {
      /* swallow — query refetch will sync eventually */
    }
  };

  const budgetText = adset.daily_budget
    ? `日 $${fM(adset.daily_budget)}`
    : adset.lifetime_budget
      ? `總 $${fM(adset.lifetime_budget)}`
      : "—";

  return (
    <>
      <tr
        className="adset-row cursor-pointer"
        data-adset={adset.id}
        onClick={onRowClick}
        aria-expanded={expanded}
      >
        <td />
        <td>
          <div className="flex max-w-[240px] items-center gap-1.5 pl-6">
            <span
              aria-hidden="true"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-[10px] text-ink"
            >
              {expanded ? "▼" : "▶"}
            </span>
            <span className="truncate text-[13px] font-medium" title={adset.name}>
              {adset.name}
            </span>
          </div>
        </td>
        {multiAcct && <td />}
        <td>
          <Badge status={adset.status} />
        </td>
        <td className="num">{fM(ins.spend)}</td>
        <td className="num">{fN(ins.impressions)}</td>
        <td className="num">{fN(ins.clicks)}</td>
        <td className="num">{fP(ins.ctr)}</td>
        <td className="num">{fM(ins.cpc)}</td>
        <td className="num">{msgs > 0 ? fN(msgs) : "—"}</td>
        <td className="num">{msgs > 0 ? `$${fM(spend / msgs)}` : "—"}</td>
        <td className="num whitespace-nowrap">{budgetText}</td>
        <td onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1.5">
            <Toggle
              checked={adset.status === "ACTIVE"}
              onChange={(e) => {
                void onToggleStatus(e.currentTarget.checked);
              }}
            />
            <Button
              size="sm"
              className="border-0 text-gray-500 hover:text-orange"
              onClick={() => onOpenBudget({ kind: "adset", id: adset.id, name: adset.name })}
            >
              調整預算
            </Button>
          </div>
        </td>
      </tr>
      {expanded && (
        <AdsetCreatives query={creativesQuery} colCount={colCount} multiAcct={multiAcct} />
      )}
    </>
  );
}

export const AdsetRow = memo(AdsetRowInner);

function AdsetCreatives({
  query,
  colCount,
  multiAcct,
}: {
  query: ReturnType<typeof useCreatives>;
  colCount: number;
  multiAcct: boolean;
}) {
  if (query.isLoading || query.isPending) {
    return (
      <tr className="creative-row">
        <td colSpan={colCount} style={{ background: "#FFFCFA" }}>
          <div className="flex items-center gap-2.5 pl-[72px] pr-6 py-3 text-[13px] font-semibold text-orange">
            <Spinner size={16} /> 載入廣告中...
          </div>
        </td>
      </tr>
    );
  }
  if (query.isError) {
    return (
      <tr className="creative-row">
        <td colSpan={colCount} style={{ background: "#FFF5F0" }}>
          <div className="pl-[72px] pr-6 py-3 text-[13px] font-semibold text-red">
            無法載入廣告：{query.error instanceof Error ? query.error.message : "未知錯誤"}
          </div>
        </td>
      </tr>
    );
  }
  const data = query.data ?? [];
  if (data.length === 0) {
    return (
      <tr className="creative-row">
        <td colSpan={colCount} style={{ background: "#FFFCFA" }}>
          <div className="pl-[72px] pr-6 py-3 text-[13px] font-medium text-gray-500">
            此廣告組合下沒有廣告
          </div>
        </td>
      </tr>
    );
  }
  return (
    <>
      {data.map((creative) => (
        <CreativeRow key={creative.id} creative={creative} multiAcct={multiAcct} />
      ))}
    </>
  );
}
