import {
  BREAKDOWN_DIM_LABELS,
  type BreakdownDim,
  type BreakdownLevel,
  useBreakdown,
} from "@/api/hooks/useBreakdown";
import { cn } from "@/lib/cn";
import type { DateConfig } from "@/lib/datePicker";
import { fM, fN, fP } from "@/lib/format";
import { HBarChart } from "@/views/analytics/charts/HBarChart";
import { useMemo, useState } from "react";

const DIMS: BreakdownDim[] = ["publisher_platform", "gender", "age", "region"];

interface Props {
  level: BreakdownLevel;
  id: string;
  date: DateConfig;
  hideMoney: boolean;
  /** Skip mounting the underlying queries until the panel is visible
   *  (parent row is expanded). Avoids loading 4× breakdowns × N rows
   *  on first render of a report with many adsets. */
  enabled?: boolean;
}

interface BreakdownRow {
  key: string;
  spend: string | number | null;
  impressions: string | number | null;
  clicks: string | number | null;
  ctr: string | number | null;
  cpc: string | number | null;
  cpm: string | number | null;
  msgs: number;
}

const num = (v: string | number | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Breakdown analytics panel grouped by one of:
 *   版位 (publisher_platform) / 性別 (gender) / 年齡層 (age) / 地區 (region)
 *
 * Layout (top → bottom):
 *   1. 4-tab dim switcher
 *   2. Insight summary cards (主要花費 / 最佳 CTR / 最佳轉換)
 *   3. Bar chart (花費 distribution by bucket)
 *   4. Detail table
 *
 * Tabs switch dimensions; only the active dim is fetched (each tab
 * is its own React Query, lazily enabled).
 */
export function BreakdownPanel({ level, id, date, hideMoney, enabled = true }: Props) {
  const [active, setActive] = useState<BreakdownDim>("publisher_platform");
  return (
    <div className="rounded-lg border border-border bg-white">
      <div className="flex gap-1 border-b border-border bg-bg p-1">
        {DIMS.map((dim) => (
          <button
            key={dim}
            type="button"
            onClick={() => setActive(dim)}
            className={cn(
              "h-7 flex-1 rounded-md px-2 text-[12px] font-semibold transition-colors",
              active === dim
                ? "bg-orange text-white"
                : "bg-transparent text-gray-500 hover:bg-orange-bg hover:text-orange",
            )}
          >
            {BREAKDOWN_DIM_LABELS[dim]}
          </button>
        ))}
      </div>
      <BreakdownBody
        level={level}
        id={id}
        dim={active}
        date={date}
        hideMoney={hideMoney}
        enabled={enabled}
      />
    </div>
  );
}

function BreakdownBody({
  level,
  id,
  dim,
  date,
  hideMoney,
  enabled,
}: {
  level: BreakdownLevel;
  id: string;
  dim: BreakdownDim;
  date: DateConfig;
  hideMoney: boolean;
  enabled: boolean;
}) {
  const query = useBreakdown(level, id, dim, date, enabled);
  const rows = query.data ?? [];

  if (query.isLoading) {
    return <div className="px-3 py-3 text-[12px] text-gray-300">載入中...</div>;
  }
  if (query.isError) {
    return (
      <div className="px-3 py-3 text-[12px] text-red">
        載入失敗:{query.error instanceof Error ? query.error.message : "未知錯誤"}
      </div>
    );
  }
  if (rows.length === 0) {
    return <div className="px-3 py-3 text-[12px] text-gray-300">無資料</div>;
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <InsightCards rows={rows} dim={dim} hideMoney={hideMoney} />
      <DistributionChart rows={rows} dim={dim} />
      <BreakdownTable rows={rows} dim={dim} hideMoney={hideMoney} />
    </div>
  );
}

function InsightCards({
  rows,
  dim,
  hideMoney,
}: {
  rows: BreakdownRow[];
  dim: BreakdownDim;
  hideMoney: boolean;
}) {
  const insights = useMemo(() => {
    if (rows.length === 0) return null;

    const totalSpend = rows.reduce((s, r) => s + num(r.spend), 0);
    const totalImps = rows.reduce((s, r) => s + num(r.impressions), 0);

    // Spend leader (or impressions leader when money is hidden)
    const topSpend = rows.reduce<BreakdownRow>(
      (best, r) => (num(r.spend) > num(best.spend) ? r : best),
      rows[0] as BreakdownRow,
    );
    const topImps = rows.reduce<BreakdownRow>(
      (best, r) => (num(r.impressions) > num(best.impressions) ? r : best),
      rows[0] as BreakdownRow,
    );

    // CTR leader (only consider rows with non-trivial impressions to
    // avoid a 1-impression / 1-click bucket flaunting 100% CTR).
    const ctrPool = rows.filter((r) => num(r.impressions) >= 100);
    const topCtr =
      ctrPool.length > 0
        ? ctrPool.reduce(
            (best, r) => (num(r.ctr) > num(best.ctr) ? r : best),
            ctrPool[0] as BreakdownRow,
          )
        : null;

    // Best (= lowest) cost-per-message bucket. Requires at least one
    // message — otherwise we'd divide by zero.
    const msgPool = rows.filter((r) => r.msgs > 0);
    const bestMsg =
      msgPool.length > 0
        ? msgPool.reduce(
            (best, r) => (num(r.spend) / r.msgs < num(best.spend) / best.msgs ? r : best),
            msgPool[0] as BreakdownRow,
          )
        : null;

    return { topSpend, topImps, topCtr, bestMsg, totalSpend, totalImps };
  }, [rows]);

  if (!insights) return null;

  // When hideMoney is on, the spend leader card switches to
  // impressions so the share page doesn't expose dollar amounts.
  const moneyLeader = hideMoney ? insights.topImps : insights.topSpend;
  const moneyLeaderValue = hideMoney
    ? `${fN(moneyLeader.impressions)} 曝光`
    : `$${fM(num(moneyLeader.spend))}`;
  const moneyLeaderShare = hideMoney
    ? insights.totalImps > 0
      ? `${((num(moneyLeader.impressions) / insights.totalImps) * 100).toFixed(0)}%`
      : "—"
    : insights.totalSpend > 0
      ? `${((num(moneyLeader.spend) / insights.totalSpend) * 100).toFixed(0)}%`
      : "—";

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <InsightCard
        label={hideMoney ? "主要曝光" : "主要花費"}
        primary={translateBucket(dim, moneyLeader.key)}
        secondary={`${moneyLeaderValue} (${moneyLeaderShare})`}
        accent="orange"
      />
      <InsightCard
        label="最佳 CTR"
        primary={insights.topCtr ? translateBucket(dim, insights.topCtr.key) : "—"}
        secondary={insights.topCtr ? fP(insights.topCtr.ctr) : "資料不足"}
        accent="green"
      />
      <InsightCard
        label="最佳轉換"
        primary={insights.bestMsg ? translateBucket(dim, insights.bestMsg.key) : "—"}
        secondary={
          insights.bestMsg
            ? hideMoney
              ? `${insights.bestMsg.msgs} 則私訊`
              : `$${fM(num(insights.bestMsg.spend) / insights.bestMsg.msgs)} / 私訊`
            : "無私訊資料"
        }
        accent="orange"
      />
    </div>
  );
}

function InsightCard({
  label,
  primary,
  secondary,
  accent,
}: {
  label: string;
  primary: string;
  secondary: string;
  accent: "orange" | "green";
}) {
  return (
    <div className="rounded-lg border border-border bg-bg px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div
        className={cn(
          "mt-1 truncate text-[14px] font-bold",
          accent === "orange" ? "text-orange" : "text-green",
        )}
        title={primary}
      >
        {primary}
      </div>
      <div className="text-[11px] text-gray-500">{secondary}</div>
    </div>
  );
}

function DistributionChart({ rows, dim }: { rows: BreakdownRow[]; dim: BreakdownDim }) {
  // Use impressions for the chart so it works regardless of hideMoney
  // mode and gives a non-zero distribution even on no-spend rows.
  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => num(b.impressions) - num(a.impressions));
    return copy.slice(0, 8);
  }, [rows]);

  const labels = sorted.map((r) => translateBucket(dim, r.key));
  const data = sorted.map((r) => num(r.impressions));
  const total = data.reduce((s, v) => s + v, 0);

  if (total === 0) return null;

  // Height scales with bar count so 1-bar charts don't dominate.
  const height = Math.max(80, sorted.length * 28 + 30);

  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2">
      <div className="mb-1 text-[11px] font-semibold text-gray-500">曝光分布</div>
      <div style={{ height }}>
        <HBarChart
          labels={labels}
          data={data}
          color="#FF6B2C"
          formatLabel={(v) => fN(v)}
          formatTick={(v) => fN(v)}
          padRight={70}
        />
      </div>
    </div>
  );
}

function BreakdownTable({
  rows,
  dim,
  hideMoney,
}: {
  rows: BreakdownRow[];
  dim: BreakdownDim;
  hideMoney: boolean;
}) {
  const money = (v: string | number | null | undefined) =>
    hideMoney ? "—" : v !== null && v !== undefined && v !== "" ? `$${fM(v)}` : "—";

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-border bg-bg">
            <th className="px-3 py-2 text-left font-semibold text-ink">
              {BREAKDOWN_DIM_LABELS[dim]}
            </th>
            <th className="px-3 py-2 text-right font-semibold text-ink">花費</th>
            <th className="px-3 py-2 text-right font-semibold text-ink">曝光</th>
            <th className="px-3 py-2 text-right font-semibold text-ink">點擊</th>
            <th className="px-3 py-2 text-right font-semibold text-ink">CTR</th>
            <th className="px-3 py-2 text-right font-semibold text-ink">CPC</th>
            <th className="px-3 py-2 text-right font-semibold text-ink">私訊</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={`${r.key}-${i}`}
              className="border-b border-border last:border-b-0 hover:bg-orange-bg"
            >
              <td className="px-3 py-2 text-ink">{translateBucket(dim, r.key)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(r.spend)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fN(r.impressions)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fN(r.clicks)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fP(r.ctr)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(r.cpc)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.msgs > 0 ? fN(r.msgs) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** FB returns raw enum strings (e.g. "facebook", "male"). Localise
 *  the small fixed set; pass everything else through unchanged. */
function translateBucket(dim: BreakdownDim, raw: string): string {
  if (!raw) return "—";
  if (dim === "gender") {
    if (raw === "male") return "男";
    if (raw === "female") return "女";
    if (raw === "unknown") return "未知";
    return raw;
  }
  if (dim === "publisher_platform") {
    const map: Record<string, string> = {
      facebook: "Facebook",
      instagram: "Instagram",
      audience_network: "Audience Network",
      messenger: "Messenger",
      threads: "Threads",
    };
    return map[raw] ?? raw;
  }
  return raw;
}
