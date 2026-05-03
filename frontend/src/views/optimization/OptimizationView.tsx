import { type AgentCampaignDigest, type AgentMeta, api } from "@/api/client";
import { useAccounts } from "@/api/hooks/useAccounts";
import { useMultiAccountOverview } from "@/api/hooks/useMultiAccountOverview";
import { Button } from "@/components/Button";
import { DatePicker } from "@/components/DatePicker";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { Spinner } from "@/components/Spinner";
import { Topbar } from "@/layout/Topbar";
import { toLabel } from "@/lib/datePicker";
import { getIns, getMsgCount } from "@/lib/insights";
import { useAccountsStore } from "@/stores/accountsStore";
import { useFiltersStore } from "@/stores/filtersStore";
import { useUiStore } from "@/stores/uiStore";
import type { FbCampaign } from "@/types/fb";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Markdown } from "./Markdown";

/**
 * 成效優化中心 — 5-agent advisor board.
 *
 * Replaces the earlier algorithmic severity board (需立即處理 /
 * 建議觀察 / 表現良好) with five AI personas, each analysing the
 * full set of currently visible campaigns from their own angle:
 *
 *   📱 Paid Social Strategist  — Meta funnel + audience engineering
 *   ✍️ Ad Creative Strategist  — hook/CTA, A/B testing, fatigue
 *   📋 Paid Media Auditor      — structural + tracking + bidding
 *   🚀 Growth Hacker           — funnel, LTV:CAC, channel exploration
 *   📊 Analytics Reporter      — KPI/statistical signal extraction
 *
 * Each card fires its own React Query call to /api/optimization/
 * agent-advice in parallel so the 5 columns stream in
 * independently. Results are cached for 30 minutes per
 * (agent × date × campaign-set hash) to keep Gemini token spend
 * predictable while the user moves between views.
 */
export function OptimizationView() {
  const accountsQuery = useAccounts();
  const allAccounts = accountsQuery.data ?? [];
  const visibleAll = useAccountsStore((s) => s.visibleAccounts)(allAccounts);

  const settingsReady = useUiStore((s) => s.settingsReady);
  const date = useFiltersStore((s) => s.date.optimization);
  const setDate = useFiltersStore((s) => s.setDate);

  const overview = useMultiAccountOverview(visibleAll, date, { includeArchived: false });

  const agentsQuery = useQuery({
    queryKey: ["optimization", "agents-meta"],
    queryFn: () => api.optimization.agents(),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const agents = agentsQuery.data?.data ?? [];

  // Build the compact campaign digests once — every agent card
  // shares the same input. Filter to "currently running" campaigns
  // (active, or paused-with-spend in window) so we don't waste
  // tokens describing zombie campaigns from years ago.
  const digests = useMemo(() => buildDigests(overview.campaigns, allAccounts), [overview.campaigns, allAccounts]);
  const dateLabel = toLabel(date);

  return (
    <>
      <Topbar title="成效優化中心">
        <DatePicker value={date} onChange={(cfg) => setDate("optimization", cfg)} />
      </Topbar>

      <div className="min-w-0 flex-1 p-3 md:p-5">
        {!settingsReady ? (
          <LoadingState
            title="載入優化資料中..."
            loaded={overview.loadedCount}
            total={overview.totalCount}
          />
        ) : visibleAll.length === 0 ? (
          <EmptyState>請先在設定中啟用廣告帳戶</EmptyState>
        ) : overview.isLoading || overview.insightsPending ? (
          <LoadingState
            title="分析所有行銷活動中..."
            loaded={overview.loadedCount}
            total={overview.totalCount}
          />
        ) : digests.length === 0 ? (
          <EmptyState>目前沒有正在進行中的行銷活動</EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
            {agents.map((agent) => (
              <AgentAdviceCard
                key={agent.id}
                agent={agent}
                digests={digests}
                dateLabel={dateLabel}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Card ─────────────────────────────────────────────────────

interface AgentAdviceCardProps {
  agent: AgentMeta;
  digests: AgentCampaignDigest[];
  dateLabel: string;
}

function AgentAdviceCard({ agent, digests, dateLabel }: AgentAdviceCardProps) {
  // Stable cache key — same set of campaigns × same date → reuse
  // the previous Gemini response (saves both latency and tokens).
  const campaignKey = useMemo(() => digestKey(digests), [digests]);

  const adviceQuery = useQuery({
    queryKey: ["optimization", "advice", agent.id, dateLabel, campaignKey],
    queryFn: () =>
      api.optimization.agentAdvice({
        agentId: agent.id,
        dateLabel,
        campaigns: digests,
      }),
    staleTime: 30 * 60_000, // 30 min
    enabled: digests.length > 0,
    retry: 0, // Gemini errors usually mean rate-limit / quota — no auto-retry
  });

  return (
    <section className="flex flex-col rounded-2xl border border-border bg-white p-4 md:p-5">
      <header className="mb-3 flex items-start gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl shadow-sm"
          style={{ backgroundColor: `${agent.color}1a`, color: agent.color }}
          aria-hidden="true"
        >
          {agent.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-bold text-ink">{agent.name_zh}</h2>
          <div className="truncate text-[11px] text-gray-400">{agent.name_en}</div>
          <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-gray-500">
            {agent.role_zh}
          </div>
        </div>
      </header>

      <div className="min-h-[160px] flex-1">
        {adviceQuery.isLoading || adviceQuery.isFetching ? (
          <div className="flex h-[160px] items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-[12px] text-gray-400">
              <Spinner size={20} />
              <span>{agent.name_zh}思考中...</span>
            </div>
          </div>
        ) : adviceQuery.isError ? (
          <div className="flex flex-col gap-2 text-[12px] text-red-600">
            <div>分析失敗:{(adviceQuery.error as Error).message}</div>
            <Button variant="ghost" size="sm" onClick={() => adviceQuery.refetch()}>
              重試
            </Button>
          </div>
        ) : adviceQuery.data ? (
          <Markdown>{adviceQuery.data.data.advice_md}</Markdown>
        ) : null}
      </div>
    </section>
  );
}

// ── Helpers ──────────────────────────────────────────────────

/** Build the compact per-campaign digest the agent endpoint expects.
 *  Filter to running / paused-with-spend so the LLM doesn't waste
 *  tokens summarising long-dead campaigns. */
function buildDigests(
  campaigns: FbCampaign[],
  accounts: Array<{ id: string; name: string }>,
): AgentCampaignDigest[] {
  const acctName = new Map(accounts.map((a) => [a.id, a.name]));
  const out: AgentCampaignDigest[] = [];
  for (const c of campaigns) {
    const ins = getIns(c);
    const spend = Number(ins.spend) || 0;
    const isActive = c.status === "ACTIVE";
    const isPausedWithSpend = c.status === "PAUSED" && spend > 0;
    if (!isActive && !isPausedWithSpend) continue;
    const msgs = getMsgCount(c);
    out.push({
      name: c.name,
      account_name: c._accountId ? (acctName.get(c._accountId) ?? c._accountName ?? "") : "",
      objective: c.objective ?? undefined,
      status: c.status,
      spend,
      impressions: Number(ins.impressions) || 0,
      clicks: Number(ins.clicks) || 0,
      ctr: Number(ins.ctr) || 0,
      cpc: Number(ins.cpc) || 0,
      frequency: Number(ins.frequency) || 0,
      msgs,
      msg_cost: msgs > 0 && spend > 0 ? spend / msgs : 0,
    });
  }
  return out;
}

/** Stable hash for the digest array — sort by name then summarise
 *  the count + total spend rounded to nearest dollar. Two query
 *  loads with the same set of campaigns will hit the cache. */
function digestKey(digests: AgentCampaignDigest[]): string {
  const names = digests
    .map((d) => d.name)
    .slice()
    .sort()
    .join("|");
  const totalSpend = digests.reduce((s, d) => s + d.spend, 0);
  return `${digests.length}:${Math.round(totalSpend)}:${hashString(names)}`;
}

function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}
