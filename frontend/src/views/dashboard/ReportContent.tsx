import { useReportAds } from "@/api/hooks/useReportCampaign";
import { Badge } from "@/components/Badge";
import { CreativePreviewModal } from "@/components/CreativePreviewModal";
import type { DateConfig } from "@/lib/datePicker";
import { fF, fM, fN, fP } from "@/lib/format";
import { getIns, getMsgCount } from "@/lib/insights";
import type { FbAdset, FbCampaign, FbCreativeEntity } from "@/types/fb";
import { Fragment, type ReactNode, useState } from "react";
import { BreakdownPanel } from "./BreakdownPanel";

/**
 * ReportContent — presentational renderer for a single campaign's
 * summary report. Shared by the in-app <ReportModal/> and the
 * standalone /r/:campaignId share page so both render identical
 * layouts from identical data.
 *
 * `hideMoney` masks every monetary value ($) with an em-dash so the
 * report can be shared with people who should see performance metrics
 * (impressions / clicks / CTR / conversations) but not cost data.
 *
 * Each adset row can expand to show:
 *   - 4-tab breakdown (版位 / 性別 / 年齡 / 地區) for that adset
 *   - List of ads in the adset; each ad row also expands to its own
 *     4-tab breakdown.
 */

const ADSET_COL_COUNT = 8;
const AD_COL_COUNT = 7;

export interface ReportContentProps {
  campaign: FbCampaign;
  adsets: FbAdset[] | null;
  adsetsLoading?: boolean;
  adsetsError?: string | null;
  hideMoney: boolean;
  dateLabel?: ReactNode;
  date: DateConfig;
}

export function ReportContent({
  campaign,
  adsets,
  adsetsLoading,
  adsetsError,
  hideMoney,
  dateLabel,
  date,
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
          <div className="px-3 py-4 text-[12px] text-red">載入失敗:{adsetsError}</div>
        ) : !adsets || adsets.length === 0 ? (
          <div className="px-3 py-4 text-[12px] text-gray-300">無廣告組合</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-border bg-bg">
                  <th className="w-[28px] px-1 py-2" aria-label="展開" />
                  <th className="px-3 py-2 text-left font-semibold text-ink">名稱</th>
                  <th className="px-3 py-2 text-left font-semibold text-ink">狀態</th>
                  <th className="px-3 py-2 text-right font-semibold text-ink">花費</th>
                  <th className="px-3 py-2 text-right font-semibold text-ink">曝光</th>
                  <th className="px-3 py-2 text-right font-semibold text-ink">點擊</th>
                  <th className="px-3 py-2 text-right font-semibold text-ink">CTR</th>
                  <th className="px-3 py-2 text-right font-semibold text-ink">CPC</th>
                </tr>
              </thead>
              <tbody>
                {adsets.map((a) => (
                  <AdsetRow key={a.id} adset={a} date={date} hideMoney={hideMoney} money={money} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AdsetRow({
  adset,
  date,
  hideMoney,
  money,
}: {
  adset: FbAdset;
  date: DateConfig;
  hideMoney: boolean;
  money: (v: number | string | null | undefined) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const ai = getIns(adset);

  return (
    <Fragment>
      <tr
        className="cursor-pointer border-b border-border hover:bg-orange-bg"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-1 py-2 text-center text-[14px] text-gray-500">{expanded ? "−" : "+"}</td>
        <td className="max-w-[220px] truncate px-3 py-2 text-ink" title={adset.name}>
          {adset.name}
        </td>
        <td className="px-3 py-2">
          <Badge status={adset.status} />
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{money(ai.spend)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{fN(ai.impressions)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{fN(ai.clicks)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{fP(ai.ctr)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{money(ai.cpc)}</td>
      </tr>
      {expanded && (
        <tr className="bg-bg">
          <td className="px-2 py-3" colSpan={ADSET_COL_COUNT}>
            <div className="flex flex-col gap-3">
              <BreakdownPanel
                level="adset"
                id={adset.id}
                date={date}
                hideMoney={hideMoney}
                enabled={expanded}
              />
              <AdsList adsetId={adset.id} date={date} hideMoney={hideMoney} money={money} />
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function AdsList({
  adsetId,
  date,
  hideMoney,
  money,
}: {
  adsetId: string;
  date: DateConfig;
  hideMoney: boolean;
  money: (v: number | string | null | undefined) => string;
}) {
  const adsQuery = useReportAds(adsetId, date, true);
  const ads = adsQuery.data ?? [];

  return (
    <div className="rounded-lg border border-border bg-white">
      <div className="border-b border-border px-3 py-2 text-[12px] font-semibold text-ink">
        素材
      </div>
      {adsQuery.isLoading ? (
        <div className="px-3 py-3 text-[12px] text-gray-300">載入中...</div>
      ) : adsQuery.isError ? (
        <div className="px-3 py-3 text-[12px] text-red">
          載入失敗:{adsQuery.error instanceof Error ? adsQuery.error.message : "未知錯誤"}
        </div>
      ) : ads.length === 0 ? (
        <div className="px-3 py-3 text-[12px] text-gray-300">無素材</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-border bg-bg">
                <th className="w-[28px] px-1 py-2" aria-label="展開" />
                <th className="px-3 py-2 text-left font-semibold text-ink">素材</th>
                <th className="px-3 py-2 text-right font-semibold text-ink">花費</th>
                <th className="px-3 py-2 text-right font-semibold text-ink">曝光</th>
                <th className="px-3 py-2 text-right font-semibold text-ink">點擊</th>
                <th className="px-3 py-2 text-right font-semibold text-ink">CTR</th>
                <th className="px-3 py-2 text-right font-semibold text-ink">CPC</th>
              </tr>
            </thead>
            <tbody>
              {ads.map((ad) => (
                <AdRow key={ad.id} ad={ad} date={date} hideMoney={hideMoney} money={money} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AdRow({
  ad,
  date,
  hideMoney,
  money,
}: {
  ad: FbCreativeEntity;
  date: DateConfig;
  hideMoney: boolean;
  money: (v: number | string | null | undefined) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const ai = getIns(ad);
  const thumb = ad.creative?.thumbnail_url;

  return (
    <Fragment>
      <tr
        className="cursor-pointer border-b border-border hover:bg-orange-bg"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-1 py-2 text-center text-[14px] text-gray-500">{expanded ? "−" : "+"}</td>
        <td className="max-w-[260px] px-3 py-2 text-ink">
          <div className="flex items-center gap-2">
            {thumb ? (
              // Raw URL — JSX `src=` is an attribute binding, do NOT
              // wrap in escHtml() (would double-encode `&` and break
              // FB's signed CDN URL → 403). See commit d720fa2.
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewOpen(true);
                }}
                className="shrink-0 cursor-zoom-in"
                aria-label="放大預覽"
              >
                <img
                  src={thumb}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-[36px] w-[36px] rounded border border-border object-cover hover:border-orange"
                />
              </button>
            ) : (
              <div className="h-[36px] w-[36px] shrink-0 rounded border border-border bg-bg" />
            )}
            <span className="truncate" title={ad.name}>
              {ad.name}
            </span>
          </div>
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{money(ai.spend)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{fN(ai.impressions)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{fN(ai.clicks)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{fP(ai.ctr)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{money(ai.cpc)}</td>
      </tr>
      {expanded && (
        <tr className="bg-bg">
          <td className="px-2 py-3" colSpan={AD_COL_COUNT}>
            <BreakdownPanel
              level="ad"
              id={ad.id}
              date={date}
              hideMoney={hideMoney}
              enabled={expanded}
            />
          </td>
        </tr>
      )}
      {previewOpen && <CreativePreviewModal creative={ad} onClose={() => setPreviewOpen(false)} />}
    </Fragment>
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
