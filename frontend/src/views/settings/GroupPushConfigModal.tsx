import type {
  LinePushConfig,
  LinePushConfigInput,
  LinePushDateRange,
  LinePushFrequency,
} from "@/api/client";
import { useAccounts } from "@/api/hooks/useAccounts";
import { useCampaigns } from "@/api/hooks/useCampaigns";
import { useDeleteLinePushConfig, useSaveLinePushConfig } from "@/api/hooks/useLinePush";
import { useNicknames } from "@/api/hooks/useNicknames";
import { Button } from "@/components/Button";
import { confirm } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import { formatNickname } from "@/views/finance/financeData";
import * as Popover from "@radix-ui/react-popover";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Group-side push config editor — opened from the LINE 群組管理 table.
 *
 * Differs from the campaign-side `LinePushModal` by inverting the picker:
 * here the group is fixed and the user picks an account → campaign,
 * with substring search on both since we may have 80+ accounts and
 * thousands of campaigns.
 */

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

const DATE_RANGE_OPTIONS: Array<{ value: LinePushDateRange; label: string }> = (() => {
  const today = new Date();
  let monthToYesterdayLabel: string;
  if (today.getDate() === 1) {
    monthToYesterdayLabel = `${today.getMonth() + 1}/1`;
  } else {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    monthToYesterdayLabel = `${today.getMonth() + 1}/1-${yesterday.getMonth() + 1}/${yesterday.getDate()}`;
  }
  return [
    { value: "yesterday", label: "昨日" },
    { value: "last_7d", label: "過去 7 天" },
    { value: "last_14d", label: "過去 14 天" },
    { value: "last_30d", label: "過去 30 天" },
    { value: "this_month", label: "本月" },
    { value: "month_to_yesterday", label: `本月1日-昨日 (${monthToYesterdayLabel})` },
  ];
})();

interface GroupPushConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  groupDisplayName: string;
  /** When provided, the modal opens in edit mode pre-filled from this row. */
  editing?: LinePushConfig | null;
}

interface EditorState {
  id?: string;
  accountId: string;
  accountName: string;
  campaignId: string;
  frequency: LinePushFrequency;
  weekdays: number[];
  monthDay: number;
  hour: number;
  minute: number;
  dateRange: LinePushDateRange;
  enabled: boolean;
}

const blankState = (): EditorState => ({
  accountId: "",
  accountName: "",
  campaignId: "",
  frequency: "daily",
  weekdays: [1, 2, 3, 4, 5],
  monthDay: 1,
  hour: 9,
  minute: 0,
  dateRange: "last_7d",
  enabled: true,
});

export function GroupPushConfigModal({
  open,
  onOpenChange,
  groupId,
  groupDisplayName,
  editing,
}: GroupPushConfigModalProps) {
  const accountsQuery = useAccounts();
  const accounts = accountsQuery.data ?? [];
  const nicknamesQuery = useNicknames();
  const nicknames = nicknamesQuery.data ?? {};
  const saveMutation = useSaveLinePushConfig();
  const deleteMutation = useDeleteLinePushConfig(editing?.campaign_id ?? "");

  const [state, setState] = useState<EditorState>(() => blankState());

  // Sync from editing prop on open. Reset on close.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      const acct = accounts.find((a) => a.id === editing.account_id);
      setState({
        id: editing.id,
        accountId: editing.account_id,
        accountName: acct?.name ?? "",
        campaignId: editing.campaign_id,
        frequency: editing.frequency,
        weekdays: editing.weekdays.length ? editing.weekdays : [1, 2, 3, 4, 5],
        monthDay: editing.month_day ?? 1,
        hour: editing.hour,
        minute: editing.minute,
        dateRange: editing.date_range,
        enabled: editing.enabled,
      });
    } else {
      setState(blankState());
    }
  }, [open, editing, accounts]);

  const toggleWeekday = (d: number) => {
    const set = new Set(state.weekdays);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    setState({ ...state, weekdays: [...set].sort((a, b) => a - b) });
  };

  const save = async () => {
    if (!state.accountId) {
      toast("請選擇廣告帳號", "error");
      return;
    }
    if (!state.campaignId) {
      toast("請選擇行銷活動", "error");
      return;
    }
    const payload: LinePushConfigInput = {
      id: state.id,
      campaign_id: state.campaignId,
      account_id: state.accountId,
      group_id: groupId,
      frequency: state.frequency,
      weekdays:
        state.frequency === "weekly" || state.frequency === "biweekly" ? state.weekdays : [],
      month_day: state.frequency === "monthly" ? state.monthDay : null,
      hour: state.hour,
      minute: state.minute,
      date_range: state.dateRange,
      enabled: state.enabled,
    };
    try {
      await saveMutation.mutateAsync(payload);
      toast("已儲存推播設定", "success");
      onOpenChange(false);
    } catch (e) {
      toast(`儲存失敗：${e instanceof Error ? e.message : String(e)}`, "error", 4500);
    }
  };

  const remove = async () => {
    if (!editing) return;
    const ok = await confirm("確定要解除這筆推播設定？");
    if (!ok) return;
    try {
      await deleteMutation.mutateAsync(editing.id);
      toast("已解除推播", "success");
      onOpenChange(false);
    } catch (e) {
      toast(`解除失敗：${e instanceof Error ? e.message : String(e)}`, "error", 4500);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "編輯推播設定" : "新增推播設定"}
      subtitle={`群組:${groupDisplayName}`}
      width={520}
    >
      <div className="flex flex-col gap-3">
        {/* Account picker */}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-ink">廣告帳號</span>
          <SearchableCombobox
            items={accounts.map((a) => ({
              value: a.id,
              primary: a.name,
              secondary: a.id,
              raw: a,
            }))}
            value={state.accountId}
            onChange={(v, raw) => {
              setState({
                ...state,
                accountId: v,
                accountName: raw?.name ?? "",
                // Reset campaign when account changes (avoid orphaned id).
                campaignId: state.accountId === v ? state.campaignId : "",
              });
            }}
            placeholder="搜尋廣告帳號名稱或 ID"
            triggerEmpty="請選擇廣告帳號"
          />
        </div>

        {/* Campaign picker */}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-ink">行銷活動</span>
          <CampaignPicker
            accountId={state.accountId}
            accountName={state.accountName}
            value={state.campaignId}
            onChange={(v) => setState({ ...state, campaignId: v })}
            nicknames={nicknames}
          />
        </div>

        {/* Frequency */}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-ink">推播頻率</span>
          <div className="flex gap-1.5">
            {(["daily", "weekly", "biweekly", "monthly"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setState({ ...state, frequency: f })}
                className={cn(
                  "h-8 flex-1 rounded-lg border border-border px-2 text-[12px] font-semibold",
                  state.frequency === f
                    ? "border-orange bg-orange-bg text-orange"
                    : "bg-white text-gray-500 hover:border-orange",
                )}
              >
                {f === "daily"
                  ? "每日"
                  : f === "weekly"
                    ? "每週"
                    : f === "biweekly"
                      ? "雙週"
                      : "每月"}
              </button>
            ))}
          </div>
        </div>

        {(state.frequency === "weekly" || state.frequency === "biweekly") && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-ink">星期</span>
            <div className="flex gap-1">
              {WEEKDAY_LABELS.map((lbl, idx) => {
                const active = state.weekdays.includes(idx);
                return (
                  <button
                    key={lbl}
                    type="button"
                    onClick={() => toggleWeekday(idx)}
                    className={cn(
                      "h-8 w-8 rounded-lg border border-border text-[12px] font-semibold",
                      active
                        ? "border-orange bg-orange-bg text-orange"
                        : "bg-white text-gray-500 hover:border-orange",
                    )}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {state.frequency === "monthly" && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-ink">每月幾號 (1-28)</span>
            <input
              type="number"
              min={1}
              max={28}
              value={state.monthDay}
              onChange={(e) =>
                setState({
                  ...state,
                  monthDay: Math.max(
                    1,
                    Math.min(28, Number.parseInt(e.currentTarget.value, 10) || 1),
                  ),
                })
              }
              className="h-9 w-24 rounded-lg border border-border px-2.5 text-[13px] outline-none focus:border-orange"
            />
          </label>
        )}

        {/* Time */}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-ink">推播時間(台北)</span>
          <div className="flex items-center gap-1.5">
            <select
              value={state.hour}
              onChange={(e) =>
                setState({ ...state, hour: Number.parseInt(e.currentTarget.value, 10) })
              }
              className="h-9 rounded-lg border border-border bg-white px-2.5 text-[13px] outline-none focus:border-orange"
            >
              {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}
                </option>
              ))}
            </select>
            <span className="text-[13px] text-gray-500">:</span>
            <select
              value={state.minute}
              onChange={(e) =>
                setState({ ...state, minute: Number.parseInt(e.currentTarget.value, 10) })
              }
              className="h-9 rounded-lg border border-border bg-white px-2.5 text-[13px] outline-none focus:border-orange"
            >
              {[0, 15, 30, 45].map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, "0")}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Date range */}
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-ink">報告資料區間</span>
          <select
            value={state.dateRange}
            onChange={(e) =>
              setState({ ...state, dateRange: e.currentTarget.value as LinePushDateRange })
            }
            className="h-9 rounded-lg border border-border bg-white px-2.5 text-[13px] outline-none focus:border-orange"
          >
            {DATE_RANGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {/* Enabled */}
        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            className="custom-cb"
            checked={state.enabled}
            onChange={(e) => setState({ ...state, enabled: e.currentTarget.checked })}
          />
          啟用此推播
        </label>

        {/* Actions */}
        <div className="mt-1 flex items-center justify-between gap-2">
          {editing ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={remove}
              disabled={deleteMutation.isPending}
              className="text-red"
            >
              {deleteMutation.isPending ? "解除中..." : "解除推播"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button variant="primary" size="sm" onClick={save} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "儲存中..." : "儲存"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function CampaignPicker({
  accountId,
  accountName,
  value,
  onChange,
  nicknames,
}: {
  accountId: string;
  accountName: string;
  value: string;
  onChange: (campaignId: string) => void;
  nicknames: Record<string, { store: string; designer: string }>;
}) {
  // Always last-30d for the picker — we just need the campaign list
  // for selection, not insights for display.
  const campaignsQuery = useCampaigns(
    accountId || undefined,
    accountName || undefined,
    { preset: "last_30d", from: null, to: null },
    { includeArchived: true },
  );
  const campaigns = campaignsQuery.data ?? [];

  const items = useMemo(() => {
    return campaigns.map((c) => {
      const nick = formatNickname(nicknames[c.id]);
      return {
        value: c.id,
        primary: nick ?? c.name ?? c.id,
        secondary: nick ? c.name : c.id,
        raw: c,
      };
    });
  }, [campaigns, nicknames]);

  return (
    <SearchableCombobox
      items={items}
      value={value}
      onChange={(v) => onChange(v)}
      placeholder="搜尋行銷活動暱稱、名稱或 ID"
      triggerEmpty={accountId ? "請選擇行銷活動" : "請先選擇廣告帳號"}
      disabled={!accountId || campaignsQuery.isLoading}
      loadingText={campaignsQuery.isLoading ? "載入行銷活動中..." : undefined}
    />
  );
}

interface ComboItem<T = unknown> {
  value: string;
  primary: string;
  secondary?: string;
  raw?: T;
}

function SearchableCombobox<T>({
  items,
  value,
  onChange,
  placeholder,
  triggerEmpty,
  disabled = false,
  loadingText,
}: {
  items: ComboItem<T>[];
  value: string;
  onChange: (v: string, raw: T | undefined) => void;
  placeholder: string;
  triggerEmpty: string;
  disabled?: boolean;
  loadingText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const t = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      return (
        it.primary.toLowerCase().includes(q) ||
        (it.secondary ?? "").toLowerCase().includes(q) ||
        it.value.toLowerCase().includes(q)
      );
    });
  }, [items, query]);

  const selected = items.find((it) => it.value === value) ?? null;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-border bg-white px-2.5 text-left text-[13px] outline-none focus:border-orange disabled:bg-bg disabled:text-gray-300",
            !selected && !disabled && "text-gray-300",
          )}
        >
          <span className="truncate">{loadingText ?? selected?.primary ?? triggerEmpty}</span>
          <span className="shrink-0 text-gray-300">▾</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-[1100] w-[var(--radix-popover-trigger-width)] rounded-xl border border-border bg-white p-2 shadow-md"
        >
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder={placeholder}
            className="mb-2 h-9 w-full rounded-lg border border-border px-2.5 text-[13px] outline-none focus:border-orange"
          />
          <div className="px-1 pb-1 text-[11px] text-gray-300">
            {filtered.length} / {items.length}
          </div>
          <div
            // 行動裝置:Popover 開在 bottom-sheet Modal 內時,沒設
            // touch-action / overscroll-behavior 會讓內部捲動被外層
            // modal 攔截,使用者捲不動清單。`pan-y` 明確告訴瀏覽器
            // 此區允許垂直手勢;`contain` 讓捲動到頂/底時不再傳播
            // 給外層,避免 Modal 跟著上下滑。
            //
            // 桌面:某些情況下 Radix Dialog 會把 wheel 事件擋下,
            // 我們直接接管 wheel 事件、手動更新 scrollTop,並
            // stopPropagation 確保事件不會冒泡到外層 modal。
            className="max-h-[260px] overflow-y-auto overscroll-contain"
            style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
            onWheel={(e) => {
              const el = e.currentTarget;
              const max = el.scrollHeight - el.clientHeight;
              const next = Math.max(0, Math.min(max, el.scrollTop + e.deltaY));
              if (next !== el.scrollTop) {
                el.scrollTop = next;
                e.stopPropagation();
              }
            }}
          >
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-center text-[12px] text-gray-300">無符合的項目</div>
            ) : (
              filtered.map((it) => {
                const active = it.value === value;
                return (
                  <button
                    key={it.value}
                    type="button"
                    onClick={() => {
                      onChange(it.value, it.raw);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left",
                      active ? "bg-orange-bg text-orange" : "text-ink hover:bg-orange-bg",
                    )}
                  >
                    <span className="w-full truncate text-[13px] font-semibold">{it.primary}</span>
                    {it.secondary && (
                      <span className="w-full truncate font-mono text-[10px] text-gray-300">
                        {it.secondary}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
