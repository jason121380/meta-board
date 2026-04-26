import {
  BREAKDOWN_DIM_LABELS,
  type BreakdownDim,
  type BreakdownLevel,
  useBreakdown,
} from "@/api/hooks/useBreakdown";
import { cn } from "@/lib/cn";
import type { DateConfig } from "@/lib/datePicker";
import { fM, fN, fP } from "@/lib/format";
import { useState } from "react";

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

/**
 * Breakdown table grouped by one of:
 *   版位 (publisher_platform) / 性別 (gender) / 年齡層 (age) / 地區 (region)
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
      <BreakdownTable
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

function BreakdownTable({
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

  const money = (v: string | number | null | undefined) =>
    hideMoney ? "—" : v !== null && v !== undefined && v !== "" ? `$${fM(v)}` : "—";

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
    <div className="overflow-x-auto">
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
