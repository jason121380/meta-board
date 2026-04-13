import { useAccounts } from "@/api/hooks/useAccounts";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Loading } from "@/components/Loading";
import { Topbar } from "@/layout/Topbar";
import { accountStatusColor, accountStatusLabel } from "@/lib/accountStatus";
import { cn } from "@/lib/cn";
import { useAccountsStore } from "@/stores/accountsStore";
import { useMemo, useState } from "react";
import {
  countChecked,
  groupAccountsByBusiness,
  reorderByDrop,
  sortAccountsByOrder,
} from "./settingsData";

/**
 * Settings view — 260px BM panel on the left, accounts panel on
 * the right with multi-select checkboxes + drag-to-reorder.
 *
 * Drag-sort uses native HTML5 drag events (same as the legacy code).
 * Reordering writes to accountsStore.order; checkboxes write to
 * accountsStore.selectedIds on save. Ephemeral "pending" state is
 * kept in component state (`pendingChecked`) and only committed to
 * the store when the user clicks 儲存.
 *
 * Ported from dashboard.html lines 2296–2415.
 */
export function SettingsView() {
  const accountsQuery = useAccounts();
  const allAccounts = accountsQuery.data ?? [];
  const savedSelectedIds = useAccountsStore((s) => s.selectedIds);
  const setSelectedIds = useAccountsStore((s) => s.setSelectedIds);
  const order = useAccountsStore((s) => s.order);
  const setOrder = useAccountsStore((s) => s.setOrder);

  const groups = useMemo(() => groupAccountsByBusiness(allAccounts), [allAccounts]);
  const [activeBmKey, setActiveBmKey] = useState<string | null>(null);
  const [pendingChecked, setPendingChecked] = useState<Set<string>>(
    () => new Set(savedSelectedIds),
  );
  const [search, setSearch] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const activeGroup = groups.find((g) => g.key === activeBmKey) ?? null;

  const visibleInGroup = useMemo(() => {
    if (!activeGroup) return [];
    const q = search.trim().toLowerCase();
    const filtered = activeGroup.accounts.filter(
      (a) => !q || a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q),
    );
    return sortAccountsByOrder(filtered, order);
  }, [activeGroup, order, search]);

  const toggleCheck = (id: string) => {
    setPendingChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllInGroup = (checked: boolean) => {
    if (!activeGroup) return;
    setPendingChecked((prev) => {
      const next = new Set(prev);
      for (const a of activeGroup.accounts) {
        if (checked) next.add(a.id);
        else next.delete(a.id);
      }
      return next;
    });
  };

  const save = () => {
    setSelectedIds([...pendingChecked]);
  };

  // ── Drag handlers ─────────────────────────────────────────
  const onDragStart = (id: string) => setDraggingId(id);
  const onDragEnd = () => setDraggingId(null);
  const onDrop = (targetId: string) => {
    if (!draggingId) return;
    const currentIds = visibleInGroup.map((a) => a.id);
    const movingIdx = currentIds.indexOf(draggingId);
    const targetIdx = currentIds.indexOf(targetId);
    if (movingIdx < 0 || targetIdx < 0) return;
    const reordered = reorderByDrop(
      // Seed the base order with the currently displayed ids so drops
      // within an unordered group get a deterministic start.
      order.length === 0 ? currentIds : order,
      draggingId,
      targetId,
    );
    setOrder(reordered);
    setDraggingId(null);
  };

  const pendingCount = pendingChecked.size;
  const totalCount = allAccounts.length;

  return (
    <>
      <Topbar title="設定">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            已選 {pendingCount} / {totalCount} 個帳戶
          </span>
          <Button variant="primary" size="sm" onClick={save}>
            儲存
          </Button>
        </div>
      </Topbar>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: BM panel */}
        <aside className="flex w-[260px] shrink-0 flex-col border-r border-border bg-white">
          <div className="border-b border-border px-4 py-3.5 text-[13px] font-bold text-ink">
            企業管理平台
          </div>
          <div className="flex-1 overflow-y-auto">
            {accountsQuery.isLoading ? (
              <Loading>載入中</Loading>
            ) : groups.length === 0 ? (
              <div className="px-4 py-4 text-[13px] text-gray-300">無廣告帳戶</div>
            ) : (
              groups.map((g) => {
                const active = g.key === activeBmKey;
                const checked = countChecked(g, pendingChecked);
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setActiveBmKey(g.key)}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between gap-2 border-b border-border px-4 py-3 text-left",
                      active ? "border-l-[3px] border-l-orange bg-orange-bg" : "hover:bg-orange-bg",
                    )}
                  >
                    <div>
                      <div className="text-[13px] font-semibold text-ink">{g.name}</div>
                      <div className="mt-0.5 text-[11px] text-gray-500">
                        {g.accounts.length} 個帳號
                      </div>
                    </div>
                    {checked > 0 && (
                      <span className="shrink-0 rounded-full bg-orange px-1.5 py-[1px] text-[11px] font-semibold text-white">
                        {checked}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right: accounts panel */}
        <div className="flex flex-1 flex-col bg-bg">
          <div className="flex flex-col gap-2 border-b border-border bg-white px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 text-sm font-bold text-ink">
                {activeGroup?.name ?? "選擇左側企業管理平台"}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => selectAllInGroup(true)}
                className="px-2 text-[11px]"
              >
                全選
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => selectAllInGroup(false)}
                className="px-2 text-[11px]"
              >
                全消
              </Button>
            </div>
            <input
              placeholder="搜尋廣告帳號..."
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              className="h-[30px] w-full rounded-lg border border-border px-2.5 text-xs outline-none focus:border-orange"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {!activeGroup ? (
              <EmptyState>點選左側企業管理平台</EmptyState>
            ) : visibleInGroup.length === 0 ? (
              <EmptyState>無符合條件的廣告帳號</EmptyState>
            ) : (
              visibleInGroup.map((acc) => {
                const isChecked = pendingChecked.has(acc.id);
                const color = accountStatusColor(acc.account_status);
                const isDragging = draggingId === acc.id;
                return (
                  <div
                    key={acc.id}
                    data-acct-id={acc.id}
                    draggable
                    onDragStart={() => onDragStart(acc.id)}
                    onDragEnd={onDragEnd}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      onDrop(acc.id);
                    }}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 border-b border-border bg-white px-4 py-2.5 hover:bg-orange-bg",
                      isDragging && "opacity-40",
                    )}
                    onClick={() => toggleCheck(acc.id)}
                  >
                    <span
                      className="shrink-0 cursor-grab px-1 text-xs text-gray-300"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      ⠿
                    </span>
                    <input
                      type="checkbox"
                      className="custom-cb"
                      checked={isChecked}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleCheck(acc.id)}
                      aria-label={`toggle ${acc.name}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{acc.name}</div>
                      <div className="text-[11px] text-gray-300">{acc.id}</div>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-1.5 py-[1px] text-[11px] font-semibold"
                      style={{
                        background: `var(--${color}-bg)`,
                        color: `var(--${color})`,
                      }}
                    >
                      {accountStatusLabel(acc.account_status)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}
