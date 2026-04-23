import { Badge } from "@/components/Badge";
import { fF, fM, fN, fP } from "@/lib/format";
import { getIns, getMsgCount } from "@/lib/insights";
import type { FbAdset, FbCampaign } from "@/types/fb";
import type { ReactNode } from "react";

/**
 * ReportContent — presentational renderer for a single campaign's
 * summary report. Shared by the in-app <ReportModal/> and the
 * standalone /r/:campaignId share page so both render identical
 * layouts from identical data.
 *
 * `hideMoney` masks every monetary value ($) with an em-dash so the
 * report can be shared with people who should see performance metrics
 * (impressions / clicks / CTR / conversations) but not cost data.
 */

export interface ReportContentProps {
  campaign: FbCampaign;
  adsets: FbAdset[] | null;
  adsetsLoading?: boolean;
  adsetsError?: string | null;
  hideMoney: boolean;
  dateLabel?: ReactNode;
}

export function ReportContent({
  campaign,
  adsets,
  adsetsLoading,
  adsetsError,
  hideMoney,
  dateLabel,
}: ReportContentProps) {
  const ins = getIns(campaign);
  const msgs = getMsgCount(campaign);
  const spend = Number(ins.spend) || 0;
  const msgCost = msgs > 0 ? spend / msgs : null;

  const money = (v: number | string | null | undefined) =>
    hideMoney ? "—" : v !== null && v !== undefined && v !== "" ? `$${fM(v)}` : "—";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Badge status={campaign.status} />
          {campaign.objective && (
            <span className="rounded-full border border-border px-2 py-[2px] text-[11px] text-gray-500">
              {campaign.objective}
            </span>
          )}
          {dateLabel && <span className="ml-auto text-[11px] text-gray-500">{dateLabel}</span>}
        </div>
        <div className="text-[15px] font-bold text-ink md:text-base">{campaign.name}</div>
        {campaign._accountName && (
          <div className="text-[11px] text-gray-500">{campaign._accountName}</div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="花費" value={money(ins.spend)} />
        <Stat label="曝光" value={fN(ins.impressions)} />
        <Stat label="點擊" value={fN(ins.clicks)} />
        <Stat label="CTR" value={fP(ins.ctr)} />
        <Stat label="CPC" value={money(ins.cpc)} />
        <Stat label="CPM" value={money(ins.cpm)} />
        <Stat label="頻次" value={fF(ins.frequency)} />
        <Stat label="觸及" value={fN(ins.reach)} />
        <Stat label="私訊數" value={msgs > 0 ? fN(msgs) : "—"} />
        <Stat label="私訊成本" value={msgCost !== null ? money(msgCost) : "—"} />
        <Stat
          label="預算"
          value={
            hideMoney
              ? "—"
              : campaign.daily_budget
                ? `日 $${fM(campaign.daily_budget)}`
                : campaign.lifetime_budget
                  ? `總 $${fM(campaign.lifetime_budget)}`
                  : "組合層級"
          }
        />
      </div>

      <div className="rounded-xl border border-border bg-white">
        <div className="border-b border-border px-3 py-2 text-[12px] font-semibold text-ink">
          廣告組合
        </div>
        {adsetsLoading ? (
          <div className="px-3 py-4 text-[12px] text-gray-300">載入中...</div>
        ) : adsetsError ? (
          <div className="px-3 py-4 text-[12px] text-red">載入失敗：{adsetsError}</div>
        ) : !adsets || adsets.length === 0 ? (
          <div className="px-3 py-4 text-[12px] text-gray-300">無廣告組合</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-border bg-bg">
                  <th className="px-3 py-2 text-left font-semibold text-ink">名稱</th>
                  <th className="px-3 py-2 text-left font-semibold text-ink">狀態</th>
                  <th className="px-3 py-2 text-right font-semibold text-ink">花費</th>
                  <th className="px-3 py-2 text-right font-semibold text-ink">曝光</th>
                  <th className="px-3 py-2 text-right font-semibold text-ink">點擊</th>
                  <th className="px-3 py-2 text-right font-semibold text-ink">CTR</th>
                  <th className="px-3 py-2 text-right font-semibold text-ink">CPC</th>
                  <th className="px-3 py-2 text-right font-semibold text-ink">私訊</th>
                </tr>
              </thead>
              <tbody>
                {adsets.map((a) => {
                  const ai = getIns(a);
                  const am = getMsgCount(a);
                  return (
                    <tr key={a.id} className="border-b border-border hover:bg-orange-bg">
                      <td className="max-w-[220px] truncate px-3 py-2 text-ink" title={a.name}>
                        {a.name}
                      </td>
                      <td className="px-3 py-2">
                        <Badge status={a.status} />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(ai.spend)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fN(ai.impressions)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fN(ai.clicks)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fP(ai.ctr)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(ai.cpc)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{am > 0 ? fN(am) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-white px-3 py-2.5">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="mt-1 text-[15px] font-bold tabular-nums text-ink md:text-base">{value}</div>
    </div>
  );
}
