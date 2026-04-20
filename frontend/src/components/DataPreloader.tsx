import { api } from "@/api/client";
import { useAccounts } from "@/api/hooks/useAccounts";
import { useAccountsStore } from "@/stores/accountsStore";
import { useFiltersStore } from "@/stores/filtersStore";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

/**
 * Blocking data preloader — fetches overview data for ALL visible
 * accounts immediately after auth, then seeds the TanStack Query
 * cache so every view (Dashboard, Analytics, Alerts, Finance) loads
 * instantly from cache when the user navigates.
 *
 * Shows a full-screen modal with a REAL progress bar (not the fake
 * time-based curve). Progress increments as each account-batch
 * resolves. The modal blocks interaction until preloading completes.
 *
 * Accounts are fetched in batches of 5 via the `/api/overview`
 * endpoint. Each batch runs its accounts concurrently on the backend
 * (asyncio.gather), so overall latency ≈ slowest account in each
 * batch × number of batches. With 15 accounts: 3 batches ≈ 15-20s.
 *
 * After all batches resolve, the preloader seeds:
 *   - Per-account cache: `["overview", "act_X", date, true]`
 *   - Batch cache: `["overview", "act_1,act_2,...", date, true]`
 * so both Dashboard (single-account) and Alerts/Finance (all-accounts)
 * get instant cache hits on first render.
 */

const BATCH_SIZE = 10;

/** Module-level flag so the preloader only runs once per page load.
 * React Strict Mode double-mount won't retrigger it.
 * Exported so Shell can read the initial value for its state. */
export let didPreload = false;

interface Progress {
  loaded: number;
  total: number;
}

export function DataPreloader({ onComplete }: { onComplete: () => void }) {
  const queryClient = useQueryClient();
  const accountsQuery = useAccounts();
  const allAccounts = accountsQuery.data ?? [];
  const visibleAccounts = useAccountsStore((s) => s.visibleAccounts)(allAccounts);
  const date = useFiltersStore((s) => s.date.dashboard);

  const [progress, setProgress] = useState<Progress>({ loaded: 0, total: 0 });
  const [done, setDone] = useState(didPreload);
  const runningRef = useRef(false);

  useEffect(() => {
    if (done) return;
    if (didPreload) {
      setDone(true);
      return;
    }
    if (accountsQuery.isLoading) return;
    if (visibleAccounts.length === 0) {
      // No accounts configured — skip preloading, let
      // EmptyAccountsPrompt handle the empty state.
      didPreload = true;
      setDone(true);
      return;
    }
    if (runningRef.current) return;
    runningRef.current = true;

    const accounts = visibleAccounts;
    const total = accounts.length;
    setProgress({ loaded: 0, total });

    // Split into batches of BATCH_SIZE
    const batches: (typeof accounts)[] = [];
    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
      batches.push(accounts.slice(i, i + BATCH_SIZE));
    }

    // Per-account results accumulator
    const allResults: Record<
      string,
      { campaigns: unknown[]; insights: unknown; error: string | null }
    > = {};
    let loadedCount = 0;

    // Process batches concurrently. The backend semaphore (40 slots)
    // limits actual FB API calls, so we can safely run 4 batches of
    // 10 accounts in parallel. For 80 accounts: 8 batches ÷ 4
    // concurrent = 2 rounds × ~6s ≈ 12s (down from ~35s at 2×5).
    const MAX_CONCURRENT_BATCHES = 4;

    const processBatch = async (batch: typeof accounts) => {
      const ids = batch.map((a) => a.id);
      try {
        const result = await api.overview.batch(ids, date, { includeArchived: true });
        const data = result.data ?? {};

        for (const acc of batch) {
          const bundle = data[acc.id] ?? { campaigns: [], insights: null, error: null };
          allResults[acc.id] = bundle;

          // Seed per-account cache (for Dashboard single-select)
          queryClient.setQueryData(["overview", acc.id, date, true], {
            data: { [acc.id]: bundle },
          });
          queryClient.setQueryData(["overview-lite", acc.id, date, true], {
            data: { [acc.id]: bundle },
          });
        }
      } catch {
        for (const acc of batch) {
          allResults[acc.id] = { campaigns: [], insights: null, error: "preload failed" };
        }
      }
      loadedCount += batch.length;
      setProgress({ loaded: loadedCount, total });
    };

    // Run batches with limited concurrency
    const runAllBatches = async () => {
      const queue = [...batches];
      const workers = Array.from(
        { length: Math.min(MAX_CONCURRENT_BATCHES, queue.length) },
        async () => {
          while (queue.length > 0) {
            const batch = queue.shift();
            if (batch) await processBatch(batch);
          }
        },
      );
      await Promise.all(workers);

      // Seed batch cache (for Alerts/Finance/Analytics — all visible at once)
      const sortedIds = [...accounts.map((a) => a.id)].sort();
      const idsKey = sortedIds.join(",");
      const batchData = { data: allResults };
      queryClient.setQueryData(["overview", idsKey, date, true], batchData);
      queryClient.setQueryData(["overview-lite", idsKey, date, true], batchData);

      didPreload = true;
      setDone(true);
    };

    void runAllBatches();
  }, [done, accountsQuery.isLoading, visibleAccounts, date, queryClient]);

  // Notify the parent (Shell) that preloading finished so it can
  // mount <Outlet/>. Without this gate, views fire their own queries
  // while the preloader is still in flight, producing transient error
  // banners behind the overlay.
  useEffect(() => {
    if (done) onComplete();
  }, [done, onComplete]);

  // Smooth progress — blend real batch progress with a time-based
  // curve so the bar moves continuously instead of jumping 0→77→100.
  // The real progress (loaded/total) anchors the floor; the time
  // curve fills in the gaps between batch completions.
  const realPct = progress.total > 0 ? (progress.loaded / progress.total) * 100 : 0;
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (done) return;
    const start = performance.now();
    const id = setInterval(() => setElapsed(performance.now() - start), 80);
    return () => clearInterval(id);
  }, [done]);
  // Time curve: asymptotic 0→90% over ~15s (tau = 5000ms).
  // Never exceeds 90% so the bar doesn't lie about being done.
  const timePct = Math.min(90, (1 - Math.exp(-elapsed / 5000)) * 90);
  // Display = max(real, time) — real progress always wins when it
  // jumps ahead (batch completes), time fills the gaps in between.
  const pct = Math.round(Math.max(realPct, timePct));
  
  // To keep the illusion intact, the accompanying text "(X / Y)" must
  // smoothly match the fake percentage rather than staying frozen at
  // the real loaded count.
  const displayLoaded = Math.min(
    progress.total,
    Math.max(progress.loaded, Math.round((pct / 100) * progress.total))
  );

  if (done) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/80 backdrop-blur-sm">
      <div className="flex w-[300px] flex-col items-center gap-4 rounded-2xl border border-border bg-white px-8 py-10">
        <div className="text-[15px] font-bold text-ink">更新數據中</div>
        <div className="flex w-full flex-col items-center gap-2">
          <div className="text-[13px] font-semibold tabular-nums text-orange">{pct}%</div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full bg-orange transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          {progress.total > 0 && (
            <div className="text-[11px] text-gray-500">
              {displayLoaded > 0
                ? `已完成 ${displayLoaded} / ${progress.total} 個帳戶`
                : `正在連線 Facebook，共 ${progress.total} 個帳戶`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
