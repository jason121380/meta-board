import { useReportAds } from "@/api/hooks/useReportCampaign";
import { Badge } from "@/components/Badge";
import { CreativePreviewModal } from "@/components/CreativePreviewModal";
import type { DateConfig } from "@/lib/datePicker";
import { fF, fM, fN, fP } from "@/lib/format";
import { getIns, getMsgCount } from "@/lib/insights";
import { buildCampaignRecommendations } from "@/lib/recommendations";
import type { FbAdset, FbCampaign, FbCreativeEntity } from "@/types/fb";
import { type ReactNode, useState } from "react";
import { BreakdownInsightStrip } from "./BreakdownInsightStrip";

/**
 * Insight-oriented campaign report. Designed to answer the operator's
 * three questions at a glance:
 *   1. 我的花費換到了什麼結果？
 *   2. 哪些受眾表現最好？
 *   3. 哪個素材表現最好？
 *
 * Layout:
 *   [Header]            campaign meta + status
 *   [KPI grid]          12 KPIs (matches FB Ads Manager naming)
 *   [Recommendations]   bullet narrative (mirrors the LINE flex push)
 *   [Adset section ×N]  auto-expanded
 *     - mini KPI row
 *     - 4-card audience insight strip (best per dim)
 *     - ad cards: thumbnail + KPIs + 「★ 表現最佳」 badge
 *
 * `hideMoney` masks $ values with em-dashes for share-link recipients
 * who should see performance but not cost.
 */

const num = (v: string | number | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

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
  const spend = num(ins.spend);
  const cpc = num(ins.cpc);
  const frequency = num(ins.frequency);
  const msgCost = msgs > 0 ? spend / msgs : 0;

  const recommendations = buildCampaignRecommendations({
    spend,
    msgs,
    msgCost,
    cpc,
    frequency,
  });

  const money = (v: number | string | null | undefined): string =>
    hideMoney ? "—" : v !== null && v !== undefined && v !== "" ? `$${fM(v)}` : "—";

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
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

      {/* Campaign-wide KPIs */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="花費" value={money(ins.spend)} highlight />
        <Stat label="曝光" value={fN(ins.impressions)} />
        <Stat label="點擊" value={fN(ins.clicks)} />
        <Stat label="CTR" value={fP(ins.ctr)} />
        <Stat label="CPC" value={money(ins.cpc)} />
        <Stat label="CPM" value={money(ins.cpm)} />
        <Stat label="頻次" value={fF(ins.frequency)} />
        <Stat label="觸及" value={fN(ins.reach)} />
        <Stat label="私訊數" value={msgs > 0 ? fN(msgs) : "—"} highlight={msgs > 0} />
        <Stat label="私訊成本" value={msgs > 0 ? money(msgCost) : "—"} highlight={msgs > 0} />
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

      {/* Recommendations narrative */}
      {recommendations.length > 0 && (
        <div className="rounded-xl border border-orange/30 bg-orange-bg/40 px-4 py-3">
          <div className="mb-2 text-[12px] font-bold text-orange">優化建議</div>
          <ul className="flex flex-col gap-1.5">
            {recommendations.map((r, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: stable bullet list
                key={i}
                className="flex items-start gap-1.5 text-[13px] text-ink"
              >
                <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-orange" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Adsets — auto-expanded */}
      <div className="flex flex-col gap-3">
        <div className="text-[13px] font-bold text-ink">廣告組合表現</div>
        {adsetsLoading ? (
          <div className="rounded-xl border border-border bg-white px-3 py-4 text-[12px] text-gray-300">
            載入中...
          </div>
        ) : adsetsError ? (
          <div className="rounded-xl border border-border bg-white px-3 py-4 text-[12px] text-red">
            載入失敗:{adsetsError}
          </div>
        ) : !adsets || adsets.length === 0 ? (
          <div className="rounded-xl border border-border bg-white px-3 py-4 text-[12px] text-gray-300">
            無廣告組合
          </div>
        ) : (
          adsets.map((a) => (
            <AdsetCard key={a.id} adset={a} date={date} hideMoney={hideMoney} money={money} />
          ))
        )}
      </div>
    </div>
  );
}

function AdsetCard({
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
  const ai = getIns(adset);
  const am = getMsgCount(adset);

  return (
    <section className="rounded-xl border border-border bg-white p-3 md:p-4">
      {/* Adset header + mini KPIs */}
      <div className="mb-3 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Badge status={adset.status} />
          <span className="truncate text-[14px] font-bold text-ink" title={adset.name}>
            {adset.name}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-gray-500">
          <span>
            花費 <span className="font-semibold text-ink">{money(ai.spend)}</span>
          </span>
          <span>
            曝光 <span className="font-semibold text-ink">{fN(ai.impressions)}</span>
          </span>
          <span>
            CTR <span className="font-semibold text-ink">{fP(ai.ctr)}</span>
          </span>
          <span>
            CPC <span className="font-semibold text-ink">{money(ai.cpc)}</span>
          </span>
          {am > 0 && (
            <span>
              私訊 <span className="font-semibold text-ink">{fN(am)}</span>
            </span>
          )}
        </div>
      </div>

      {/* 4-dim audience insight strip */}
      <div className="mb-3">
        <div className="mb-1.5 text-[11px] font-semibold text-gray-500">受眾洞察</div>
        <BreakdownInsightStrip level="adset" id={adset.id} date={date} hideMoney={hideMoney} />
      </div>

      {/* Ads list */}
      <AdCards adsetId={adset.id} date={date} money={money} />
    </section>
  );
}

interface ScoredAd {
  ad: FbCreativeEntity;
  spend: number;
  msgs: number;
  msgCost: number;
  ctr: number;
}

function AdCards({
  adsetId,
  date,
  money,
}: {
  adsetId: string;
  date: DateConfig;
  money: (v: number | string | null | undefined) => string;
}) {
  const adsQuery = useReportAds(adsetId, date, true);
  const ads = adsQuery.data ?? [];

  // Rank ads within this adset: msgCost (lower is better) wins if any
  // ad has messages; otherwise CTR (higher is better).
  const scored: ScoredAd[] = ads.map((ad) => {
    const ains = getIns(ad);
    const m = getMsgCount(ad);
    const sp = num(ains.spend);
    return {
      ad,
      spend: sp,
      msgs: m,
      msgCost: m > 0 ? sp / m : Number.POSITIVE_INFINITY,
      ctr: num(ains.ctr),
    };
  });

  const hasMsgPool = scored.some((s) => s.msgs > 0);
  let bestId: string | null = null;
  if (hasMsgPool) {
    const pool = scored.filter((s) => s.msgs > 0);
    if (pool.length > 0) {
      const best = pool.reduce((b, s) => (s.msgCost < b.msgCost ? s : b), pool[0] as ScoredAd);
      bestId = best.ad.id;
    }
  } else if (scored.length > 0) {
    const best = scored.reduce((b, s) => (s.ctr > b.ctr ? s : b), scored[0] as ScoredAd);
    if (best.ctr > 0) bestId = best.ad.id;
  }

  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold text-gray-500">素材表現</div>
      {adsQuery.isLoading ? (
        <div className="rounded-lg border border-border bg-bg px-3 py-3 text-[12px] text-gray-300">
          載入中...
        </div>
      ) : adsQuery.isError ? (
        <div className="rounded-lg border border-border bg-bg px-3 py-3 text-[12px] text-red">
          載入失敗:
          {adsQuery.error instanceof Error ? adsQuery.error.message : "未知錯誤"}
        </div>
      ) : ads.length === 0 ? (
        <div className="rounded-lg border border-border bg-bg px-3 py-3 text-[12px] text-gray-300">
          無素材
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {scored.map((s) => (
            <AdCard key={s.ad.id} ad={s.ad} isBest={bestId === s.ad.id} money={money} />
          ))}
        </div>
      )}
    </div>
  );
}

function AdCard({
  ad,
  isBest,
  money,
}: {
  ad: FbCreativeEntity;
  isBest: boolean;
  money: (v: number | string | null | undefined) => string;
}) {
  const ai = getIns(ad);
  const m = getMsgCount(ad);
  const spend = num(ai.spend);
  const msgCost = m > 0 ? spend / m : null;
  const thumb = ad.creative?.thumbnail_url;
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div
      className={`relative rounded-lg border bg-bg p-3 ${
        isBest ? "border-orange" : "border-border"
      }`}
    >
      {isBest && (
        <span className="absolute -top-2 left-3 rounded-full bg-orange px-2 py-[2px] text-[10px] font-bold text-white">
          ★ 表現最佳
        </span>
      )}
      <div className="flex items-start gap-2">
        {thumb ? (
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="shrink-0 cursor-zoom-in"
            aria-label="放大預覽"
          >
            <img
              src={thumb}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-[56px] w-[56px] rounded border border-border object-cover hover:border-orange"
            />
          </button>
        ) : (
          <div className="h-[56px] w-[56px] shrink-0 rounded border border-border bg-white" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-ink" title={ad.name}>
            {ad.name}
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
            <Cell label="花費" value={money(ai.spend)} />
            <Cell label="曝光" value={fN(ai.impressions)} />
            <Cell label="CTR" value={fP(ai.ctr)} />
            <Cell label="CPC" value={money(ai.cpc)} />
            {m > 0 && <Cell label="私訊" value={fN(m)} />}
            {m > 0 && msgCost !== null && <Cell label="私訊成本" value={money(msgCost)} />}
          </div>
        </div>
      </div>
      {previewOpen && <CreativePreviewModal creative={ad} onClose={() => setPreviewOpen(false)} />}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <span>
      {label} <span className="font-semibold tabular-nums text-ink">{value}</span>
    </span>
  );
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-white px-3 py-2.5 ${
        highlight ? "border-orange" : "border-border"
      }`}
    >
      <div className="text-[11px] text-gray-500">{label}</div>
      <div
        className={`mt-1 text-[15px] font-bold tabular-nums md:text-base ${
          highlight ? "text-orange" : "text-ink"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
