import { type AgentCampaignDigest, type AgentMeta, api } from "@/api/client";
import { useAccounts } from "@/api/hooks/useAccounts";
import { useBillingUsage } from "@/api/hooks/useSubscription";
import { useMultiAccountOverview } from "@/api/hooks/useMultiAccountOverview";
import { useFbAuth } from "@/auth/FbAuthProvider";
import { Button } from "@/components/Button";
import { DatePicker } from "@/components/DatePicker";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { Spinner } from "@/components/Spinner";
import { toast } from "@/components/Toast";
import {
  UpgradeModal,
  type UpgradeModalState,
  tierLimitFromError,
} from "@/components/UpgradeModal";
import { Topbar } from "@/layout/Topbar";
import { toLabel } from "@/lib/datePicker";
import { getIns, getMsgCount } from "@/lib/insights";
import { useAccountsStore } from "@/stores/accountsStore";
import { useFiltersStore } from "@/stores/filtersStore";
import { useUiStore } from "@/stores/uiStore";
import type { FbCampaign } from "@/types/fb";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Markdown } from "./Markdown";

/**
 * AI 幕僚 — 5-agent advisor board (formerly 成效優化中心).
 *
 * Five AI personas, each analysing the same set of currently
 * running campaigns from their own angle. Click 「產生分析」 to
 * fan out one Gemini call per agent in parallel; this counts as
 * ONE quota use against the tier-gated `agent_advice_limit`:
 *
 *   free  → 0   (always blocked, opens upgrade modal on click)
 *   basic → 1 / month
 *   plus  → 4 / month
 *   max   → unlimited
 *
 * Results live in component state for the lifetime of the view —
 * navigating away discards them. This is intentional: re-clicking
 * is the only path to new advice, and persisting cross-session
 * would obscure the link between "click → quota use".
 */
export function OptimizationView() {
  const accountsQuery = useAccounts();
  const allAccounts = accountsQuery.data ?? [];
  const visibleAll = useAccountsStore((s) => s.visibleAccounts)(allAccounts);

  const settingsReady = useUiStore((s) => s.settingsReady);
  const date = useFiltersStore((s) => s.date.optimization);
  const setDate = useFiltersStore((s) => s.setDate);

  const overview = useMultiAccountOverview(visibleAll, date, { includeArchived: false });
  const { user } = useFbAuth();
  const usageQuery = useBillingUsage();

  const agentsQuery = useQuery({
    queryKey: ["optimization", "agents-meta"],
    queryFn: () => api.optimization.agents(),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const agents = agentsQuery.data?.data ?? [];

  const digests = useMemo(
    () => buildDigests(overview.campaigns, allAccounts),
    [overview.campaigns, allAccounts],
  );
  const dateLabel = toLabel(date);

  // Local card-state map: agent_id → { advice_md | error | null }.
  // null means "not generated yet" (initial CTA state). The mutation
  // result fills this in atomically when the run-agents response
  // returns, so all 5 cards transition together.
  type CardState = { advice_md: string | null; error: string | null } | null;
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [upgradeState, setUpgradeState] = useState<UpgradeModalState | null>(null);

  const runMutation = useMutation({
    mutationFn: () =>
      api.optimization.runAgents({
        fbUserId: user?.id ?? "",
        dateLabel,
        campaigns: digests,
      }),
    onSuccess: (resp) => {
      const next: Record<string, CardState> = {};
      for (const a of resp.data.advice) {
        next[a.agent_id] = { advice_md: a.advice_md, error: a.error };
      }
      setCards(next);
      // Refetch billing usage so the "本月剩 X 次" counter
      // reflects the run we just consumed.
      usageQuery.refetch();
    },
    onError: (err) => {
      const tierLimit = tierLimitFromError(err);
      if (tierLimit) {
        setUpgradeState(tierLimit);
        return;
      }
      toast(`分析失敗:${(err as Error).message}`, "error");
    },
  });

  const usage = usageQuery.data;
  const adviceLimit = usage?.limits.agent_advice ?? 0;
  const adviceUsed = usage?.usage.agent_advice ?? 0;
  const isUnlimited = adviceLimit < 0 || adviceLimit >= 999_000;
  const remaining = isUnlimited ? Number.POSITIVE_INFINITY : Math.max(0, adviceLimit - adviceUsed);
  const blockedByTier = adviceLimit === 0;
  const quotaExhausted = !isUnlimited && remaining <= 0;
  const canGenerate = digests.length > 0 && !runMutation.isPending && !quotaExhausted;
  const isFirstRun = Object.keys(cards).length === 0;

  return (
    <>
      <Topbar title="AI 幕僚">
        <DatePicker value={date} onChange={(cfg) => setDate("optimization", cfg)} />
      </Topbar>
      <UpgradeModal state={upgradeState} onClose={() => setUpgradeState(null)} />

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
          <div className="flex flex-col gap-3 md:gap-4">
            <ActionBar
              isFirstRun={isFirstRun}
              isPending={runMutation.isPending}
              canGenerate={canGenerate}
              blockedByTier={blockedByTier}
              quotaExhausted={quotaExhausted}
              adviceLimit={adviceLimit}
              adviceUsed={adviceUsed}
              isUnlimited={isUnlimited}
              campaignsCount={digests.length}
              onGenerate={() => runMutation.mutate()}
            />

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
              {agents.map((agent) => (
                <AgentAdviceCard
                  key={agent.id}
                  agent={agent}
                  state={cards[agent.id] ?? null}
                  isLoading={runMutation.isPending}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Action bar ───────────────────────────────────────────────

interface ActionBarProps {
  isFirstRun: boolean;
  isPending: boolean;
  canGenerate: boolean;
  blockedByTier: boolean;
  quotaExhausted: boolean;
  adviceLimit: number;
  adviceUsed: number;
  isUnlimited: boolean;
  campaignsCount: number;
  onGenerate: () => void;
}

function ActionBar({
  isFirstRun,
  isPending,
  canGenerate,
  blockedByTier,
  quotaExhausted,
  adviceLimit,
  adviceUsed,
  isUnlimited,
  campaignsCount,
  onGenerate,
}: ActionBarProps) {
  const quotaLabel = isUnlimited
    ? "本月無限次"
    : `本月已用 ${adviceUsed} / ${adviceLimit} 次`;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 md:flex-row md:items-center md:justify-between md:p-5">
      <div className="flex flex-col gap-1">
        <div className="text-[14px] font-bold text-ink">
          {isFirstRun ? "5 位 AI 幕僚為你診斷" : "已產生分析"}
        </div>
        <div className="text-[12px] text-gray-500">
          5 位專家會同時分析目前 {campaignsCount} 個進行中的活動,並從不同角度給出建議。
          {!blockedByTier && (
            <span className="ml-1 text-gray-400">每次點擊扣 1 次配額。</span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
        <span
          className={
            quotaExhausted || blockedByTier
              ? "text-[12px] font-semibold text-red-500"
              : "text-[12px] text-gray-500"
          }
        >
          {blockedByTier ? "Free 方案不含此功能" : quotaLabel}
        </span>
        <Button
          variant="primary"
          size="sm"
          disabled={!canGenerate}
          onClick={onGenerate}
        >
          {isPending
            ? "5 位專家分析中..."
            : isFirstRun
              ? blockedByTier
                ? "升級以使用 →"
                : "產生分析"
              : quotaExhausted
                ? "本月已用完"
                : "重新產生"}
        </Button>
      </div>
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────

interface AgentAdviceCardProps {
  agent: AgentMeta;
  state: { advice_md: string | null; error: string | null } | null;
  isLoading: boolean;
}

function AgentAdviceCard({ agent, state, isLoading }: AgentAdviceCardProps) {
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

      <div className="min-h-[140px] flex-1">
        {isLoading ? (
          <div className="flex h-[140px] items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-[12px] text-gray-400">
              <Spinner size={20} />
              <span>{agent.name_zh}思考中...</span>
            </div>
          </div>
        ) : state == null ? (
          <div className="flex h-[140px] items-center justify-center text-[12px] text-gray-400">
            點擊上方「產生分析」開始
          </div>
        ) : state.error ? (
          <div className="text-[12px] text-red-600">分析失敗:{state.error}</div>
        ) : state.advice_md ? (
          <Markdown>{state.advice_md}</Markdown>
        ) : null}
      </div>
    </section>
  );
}

// ── Helpers ──────────────────────────────────────────────────

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
