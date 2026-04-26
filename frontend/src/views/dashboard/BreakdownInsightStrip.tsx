import {
  BREAKDOWN_DIM_LABELS,
  type BreakdownDim,
  type BreakdownLevel,
  useBreakdown,
} from "@/api/hooks/useBreakdown";
import { cn } from "@/lib/cn";
import type { DateConfig } from "@/lib/datePicker";
import { fM, fN, fP } from "@/lib/format";

const DIMS: BreakdownDim[] = ["publisher_platform", "gender", "age", "region"];

const num = (v: string | number | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

interface Props {
  level: BreakdownLevel;
  id: string;
  date: DateConfig;
  hideMoney: boolean;
}

/**
 * Compact "winner per dimension" insight strip — fires all four
 * breakdown queries in parallel and shows a single best-bucket card
 * per dimension. Used when the report auto-expands every adset so
 * the viewer can see the optimal audience without clicking through
 * tabs.
 *
 * Picks the winner by:
 *   - msgs > 0 anywhere → lowest cost-per-message bucket
 *   - else → highest CTR bucket (impressions ≥100 to avoid noise)
 *   - else → highest spend / impression bucket (the "where the
 *     money/eyeballs are going" fallback)
 */
export function BreakdownInsightStrip({ level, id, date, hideMoney }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {DIMS.map((dim) => (
        <DimCard key={dim} level={level} id={id} dim={dim} date={date} hideMoney={hideMoney} />
      ))}
    </div>
  );
}

function DimCard({
  level,
  id,
  dim,
  date,
  hideMoney,
}: {
  level: BreakdownLevel;
  id: string;
  dim: BreakdownDim;
  date: DateConfig;
  hideMoney: boolean;
}) {
  const query = useBreakdown(level, id, dim, date, true);
  const rows = query.data ?? [];

  const winner = pickWinner(rows);
  const label = BREAKDOWN_DIM_LABELS[dim];

  if (query.isLoading) {
    return <PlaceholderCard label={label} text="載入中..." />;
  }
  if (!winner) {
    return <PlaceholderCard label={label} text="—" />;
  }

  const detail = formatDetail(winner.row, winner.metric, hideMoney);

  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div
        className={cn("mt-1 truncate text-[14px] font-bold text-orange")}
        title={translateBucket(dim, winner.row.key)}
      >
        {translateBucket(dim, winner.row.key)}
      </div>
      <div className="truncate text-[11px] text-gray-500" title={detail}>
        {detail}
      </div>
    </div>
  );
}

function PlaceholderCard({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-[14px] font-bold text-gray-300">{text}</div>
    </div>
  );
}

interface BreakdownRow {
  key: string;
  spend: string | number | null;
  impressions: string | number | null;
  ctr: string | number | null;
  msgs: number;
}

type WinnerMetric = "msgCost" | "ctr" | "impressions";

function pickWinner(
  rows: BreakdownRow[] | undefined,
): { row: BreakdownRow; metric: WinnerMetric } | null {
  if (!rows || rows.length === 0) return null;

  // Prefer cost-per-message when ANY bucket has messages.
  const msgPool = rows.filter((r) => r.msgs > 0);
  if (msgPool.length > 0) {
    const winner = msgPool.reduce(
      (best, r) => (num(r.spend) / r.msgs < num(best.spend) / best.msgs ? r : best),
      msgPool[0] as BreakdownRow,
    );
    return { row: winner, metric: "msgCost" };
  }

  // Otherwise CTR with a minimum-impression filter.
  const ctrPool = rows.filter((r) => num(r.impressions) >= 100);
  if (ctrPool.length > 0) {
    const winner = ctrPool.reduce(
      (best, r) => (num(r.ctr) > num(best.ctr) ? r : best),
      ctrPool[0] as BreakdownRow,
    );
    return { row: winner, metric: "ctr" };
  }

  // Final fallback: where eyeballs / dollars went.
  const winner = rows.reduce(
    (best, r) => (num(r.impressions) > num(best.impressions) ? r : best),
    rows[0] as BreakdownRow,
  );
  return { row: winner, metric: "impressions" };
}

function formatDetail(row: BreakdownRow, metric: WinnerMetric, hideMoney: boolean): string {
  if (metric === "msgCost") {
    if (hideMoney) return `${row.msgs} 則私訊`;
    return `$${fM(num(row.spend) / row.msgs)} / 私訊`;
  }
  if (metric === "ctr") {
    return `CTR ${fP(row.ctr)}`;
  }
  return `${fN(row.impressions)} 曝光`;
}

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
