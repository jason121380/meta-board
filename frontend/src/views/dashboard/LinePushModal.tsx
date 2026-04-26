import type { LinePushConfig, LinePushDateRange, LinePushFrequency } from "@/api/client";
import {
  useDeleteLinePushConfig,
  useLineGroups,
  useLinePushConfigs,
  useSaveLinePushConfig,
  useTestLinePush,
  useUpdateLineGroupLabel,
} from "@/api/hooks/useLinePush";
import { Button } from "@/components/Button";
import { confirm } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import type { FbCampaign } from "@/types/fb";
import * as Popover from "@radix-ui/react-popover";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * LINE push settings dialog — per-campaign pairing of a LINE group
 * with a recurring schedule.
 *
 * Data flow:
 *   1. `useLineGroups` feeds the group dropdown — the bot must be
 *      invited to the group first (webhook auto-registers it).
 *   2. `useLinePushConfigs(campaign.id)` lists current pairings for
 *      this campaign; each one is editable / deletable / testable.
 *   3. "新增推播" expands an inline form; on save we POST and the
 *      list refetches via React Query invalidation.
 *   4. Group labels are editable inline from the dropdown row so
 *      operators can rename a group without leaving the dialog.
 */

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

/** Build a "M/D-M/D" preview of 本月1日 → 昨日 in the user's locale. */
function monthToYesterdayPreview(): string {
  const today = new Date();
  if (today.getDate() === 1) {
    // Edge case: 1st of the month — fall back to today only.
    return `${today.getMonth() + 1}/1`;
  }
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  return `${today.getMonth() + 1}/1-${yesterday.getMonth() + 1}/${yesterday.getDate()}`;
}

/** Compute the date range options. The 本月1日-昨日 label is dynamic
 *  so it always reflects the current date when the dropdown opens. */
function getDateRangeOptions(): Array<{ value: LinePushDateRange; label: string }> {
  return [
    { value: "yesterday", label: "昨日" },
    { value: "last_7d", label: "過去 7 天" },
    { value: "last_14d", label: "過去 14 天" },
    { value: "last_30d", label: "過去 30 天" },
    { value: "this_month", label: "本月" },
    { value: "month_to_yesterday", label: `本月1日-昨日 (${monthToYesterdayPreview()})` },
  ];
}

interface GroupOption {
  group_id: string;
  group_name: string;
  label: string;
}

/** Display name priority: real LINE group_name → user nickname → raw id. */
function groupDisplayName(g: GroupOption): string {
  return g.group_name?.trim() || g.label?.trim() || g.group_id;
}

interface LinePushModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: FbCampaign;
}

type EditorState = {
  id?: string;
  groupId: string;
  frequency: LinePushFrequency;
  weekdays: number[];
  monthDay: number;
  hour: number;
  minute: number;
  dateRange: LinePushDateRange;
  enabled: boolean;
};

const NEW_EDITOR: EditorState = {
  groupId: "",
  frequency: "daily",
  weekdays: [1, 2, 3, 4, 5],
  monthDay: 1,
  hour: 9,
  minute: 0,
  dateRange: "last_7d",
  enabled: true,
};

export function LinePushModal({ open, onOpenChange, campaign }: LinePushModalProps) {
  const groupsQuery = useLineGroups();
  const configsQuery = useLinePushConfigs(open ? campaign.id : null);
  const saveMutation = useSaveLinePushConfig();
  const deleteMutation = useDeleteLinePushConfig(campaign.id);
  const testMutation = useTestLinePush();
  const renameGroup = useUpdateLineGroupLabel();

  const [editor, setEditor] = useState<EditorState | null>(null);

  // Close → discard the in-progress editor.
  useEffect(() => {
    if (!open) setEditor(null);
  }, [open]);

  const configs = configsQuery.data ?? [];
  const activeGroups = (groupsQuery.data ?? []).filter((g) => !g.left_at);

  const groupLabel = (groupId: string): string => {
    const g = groupsQuery.data?.find((x) => x.group_id === groupId);
    if (!g) return groupId;
    return groupDisplayName(g);
  };

  const startEdit = (cfg: LinePushConfig) => {
    setEditor({
      id: cfg.id,
      groupId: cfg.group_id,
      frequency: cfg.frequency,
      weekdays: cfg.weekdays.length ? cfg.weekdays : [1, 2, 3, 4, 5],
      monthDay: cfg.month_day ?? 1,
      hour: cfg.hour,
      minute: cfg.minute,
      dateRange: cfg.date_range,
      enabled: cfg.enabled,
    });
  };

  const startCreate = () => {
    setEditor({
      ...NEW_EDITOR,
      groupId: activeGroups[0]?.group_id ?? "",
    });
  };

  const save = async () => {
    if (!editor) return;
    if (!editor.groupId) {
      toast("請先選擇 LINE 群組", "error");
      return;
    }
    if (!campaign._accountId) {
      toast("找不到行銷活動的帳戶 ID", "error");
      return;
    }
    try {
      await saveMutation.mutateAsync({
        id: editor.id,
        campaign_id: campaign.id,
        account_id: campaign._accountId,
        group_id: editor.groupId,
        frequency: editor.frequency,
        weekdays: editor.frequency === "weekly" ? editor.weekdays : [],
        month_day: editor.frequency === "monthly" ? editor.monthDay : null,
        hour: editor.hour,
        minute: editor.minute,
        date_range: editor.dateRange,
        enabled: editor.enabled,
      });
      toast("已儲存推播設定", "success");
      setEditor(null);
    } catch (e) {
      toast(`儲存失敗：${e instanceof Error ? e.message : String(e)}`, "error", 4500);
    }
  };

  const remove = async (cfg: LinePushConfig) => {
    const ok = await confirm(`確定要刪除推播到「${groupLabel(cfg.group_id)}」？`);
    if (!ok) return;
    try {
      await deleteMutation.mutateAsync(cfg.id);
      toast("已刪除推播設定", "success");
    } catch (e) {
      toast(`刪除失敗：${e instanceof Error ? e.message : String(e)}`, "error", 4500);
    }
  };

  const test = async (cfg: LinePushConfig) => {
    try {
      await testMutation.mutateAsync(cfg.id);
      toast("測試推播已送出", "success");
    } catch (e) {
      toast(`測試推播失敗：${e instanceof Error ? e.message : String(e)}`, "error", 4500);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="LINE 推播設定"
      subtitle={campaign.name}
      width={520}
    >
      <div className="flex flex-col gap-3">
        {/* Empty state — no groups yet */}
        {groupsQuery.isSuccess && activeGroups.length === 0 && (
          <div className="rounded-xl bg-orange-bg px-3 py-3 text-[13px] text-ink">
            尚未偵測到任何 LINE 群組。請先把 LINE 官方帳號加入群組,bot 會自動把 group id
            記錄到這裡。
          </div>
        )}

        {/* Existing configs */}
        {configs.length > 0 && (
          <div className="flex flex-col gap-2">
            {configs.map((cfg) => (
              <ConfigCard
                key={cfg.id}
                cfg={cfg}
                label={groupLabel(cfg.group_id)}
                onEdit={() => startEdit(cfg)}
                onDelete={() => remove(cfg)}
                onTest={() => test(cfg)}
                testing={testMutation.isPending}
              />
            ))}
          </div>
        )}

        {configs.length === 0 && !editor && (
          <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-[13px] text-gray-500">
            尚未設定任何推播。點擊下方按鈕新增。
          </div>
        )}

        {/* Editor */}
        {editor && (
          <Editor
            state={editor}
            onChange={setEditor}
            groups={activeGroups}
            onRenameGroup={(groupId, label) => renameGroup.mutate({ groupId, label })}
            groupLabelOf={groupLabel}
            onCancel={() => setEditor(null)}
            onSave={save}
            saving={saveMutation.isPending}
          />
        )}

        {/* Actions */}
        {!editor && activeGroups.length > 0 && (
          <div className="flex justify-end pt-1">
            <Button variant="primary" size="sm" onClick={startCreate}>
              + 新增推播
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ConfigCard({
  cfg,
  label,
  onEdit,
  onDelete,
  onTest,
  testing,
}: {
  cfg: LinePushConfig;
  label: string;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  testing: boolean;
}) {
  const rule = useMemo(() => formatRule(cfg), [cfg]);
  const range =
    getDateRangeOptions().find((o) => o.value === cfg.date_range)?.label ?? cfg.date_range;
  const disabled = !cfg.enabled;
  return (
    <div
      className={cn("rounded-xl border border-border bg-white px-3 py-3", disabled && "opacity-60")}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-ink">{label}</span>
            {disabled && (
              <span className="rounded-full bg-red-bg px-1.5 py-[1px] text-[10px] font-semibold text-red">
                已停用
              </span>
            )}
          </div>
          <div className="mt-1 text-[12px] text-gray-500">{rule}</div>
          <div className="mt-0.5 text-[11px] text-gray-300">資料區間:{range}</div>
          {cfg.last_error && (
            <div className="mt-1 text-[11px] text-red">上次錯誤:{cfg.last_error}</div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={onTest}
            disabled={testing}
            className="rounded-md border border-border px-2 py-1 text-[11px] text-gray-500 hover:border-orange hover:text-orange disabled:opacity-50"
          >
            {testing ? "傳送中..." : "立即測試"}
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md border border-border px-2 py-1 text-[11px] text-gray-500 hover:border-orange hover:text-orange"
          >
            編輯
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md border border-border px-2 py-1 text-[11px] text-red hover:bg-red-bg"
          >
            刪除
          </button>
        </div>
      </div>
    </div>
  );
}

function Editor({
  state,
  onChange,
  groups,
  onRenameGroup,
  groupLabelOf,
  onCancel,
  onSave,
  saving,
}: {
  state: EditorState;
  onChange: (s: EditorState) => void;
  groups: GroupOption[];
  onRenameGroup: (groupId: string, label: string) => void;
  groupLabelOf: (groupId: string) => string;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [labelDraft, setLabelDraft] = useState("");

  useEffect(() => {
    setLabelDraft(groupLabelOf(state.groupId));
  }, [state.groupId, groupLabelOf]);

  const toggleWeekday = (d: number) => {
    const set = new Set(state.weekdays);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    onChange({ ...state, weekdays: [...set].sort((a, b) => a - b) });
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-bg px-3 py-3">
      {/* Group picker (searchable — bots can be in hundreds of groups) */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-ink">LINE 群組</span>
        <GroupCombobox
          groups={groups}
          value={state.groupId}
          onChange={(id) => onChange({ ...state, groupId: id })}
        />
      </div>

      {/* Rename current group */}
      {state.groupId && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-ink">群組暱稱</span>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.currentTarget.value)}
              placeholder="例如:客戶 A 群組"
              className="h-9 flex-1 rounded-lg border border-border px-2.5 text-[13px] outline-none focus:border-orange"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRenameGroup(state.groupId, labelDraft.trim())}
            >
              更新暱稱
            </Button>
          </div>
        </label>
      )}

      {/* Frequency */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-ink">推播頻率</span>
        <div className="flex gap-1.5">
          {(["daily", "weekly", "monthly"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onChange({ ...state, frequency: f })}
              className={cn(
                "h-8 flex-1 rounded-lg border border-border px-2 text-[12px] font-semibold",
                state.frequency === f
                  ? "border-orange bg-orange-bg text-orange"
                  : "bg-white text-gray-500 hover:border-orange",
              )}
            >
              {f === "daily" ? "每日" : f === "weekly" ? "每週" : "每月"}
            </button>
          ))}
        </div>
      </div>

      {/* Weekly discriminator */}
      {state.frequency === "weekly" && (
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

      {/* Monthly discriminator */}
      {state.frequency === "monthly" && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-ink">每月幾號 (1-28)</span>
          <input
            type="number"
            min={1}
            max={28}
            value={state.monthDay}
            onChange={(e) =>
              onChange({
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

      {/* Time HH:MM */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-ink">推播時間(台北)</span>
        <div className="flex items-center gap-1.5">
          <select
            value={state.hour}
            onChange={(e) =>
              onChange({ ...state, hour: Number.parseInt(e.currentTarget.value, 10) })
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
              onChange({ ...state, minute: Number.parseInt(e.currentTarget.value, 10) })
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
            onChange({ ...state, dateRange: e.currentTarget.value as LinePushDateRange })
          }
          className="h-9 rounded-lg border border-border bg-white px-2.5 text-[13px] outline-none focus:border-orange"
        >
          {getDateRangeOptions().map((o) => (
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
          onChange={(e) => onChange({ ...state, enabled: e.currentTarget.checked })}
        />
        啟用此推播
      </label>

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button variant="primary" size="sm" onClick={onSave} disabled={saving}>
          {saving ? "儲存中..." : "儲存"}
        </Button>
      </div>
    </div>
  );
}

function formatRule(cfg: LinePushConfig): string {
  const time = `${String(cfg.hour).padStart(2, "0")}:${String(cfg.minute).padStart(2, "0")}`;
  if (cfg.frequency === "daily") return `每日 ${time}`;
  if (cfg.frequency === "weekly") {
    const days = cfg.weekdays.map((d) => `週${WEEKDAY_LABELS[d] ?? "?"}`).join("、");
    return `${days || "每週"} ${time}`;
  }
  return `每月 ${cfg.month_day ?? 1} 日 ${time}`;
}

/**
 * Searchable LINE group picker. The bot can sit in hundreds of
 * groups, so a native <select> is unusable — operators need to
 * type-to-find. Filters substring (case-insensitive) against
 * group_name, label (nickname), and group_id.
 */
function GroupCombobox({
  groups,
  value,
  onChange,
}: {
  groups: GroupOption[];
  value: string;
  onChange: (groupId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Reset search + autofocus on open. The 50ms delay lets Radix
  // finish mounting the portal before we call focus().
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const t = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => {
      return (
        (g.group_name || "").toLowerCase().includes(q) ||
        (g.label || "").toLowerCase().includes(q) ||
        g.group_id.toLowerCase().includes(q)
      );
    });
  }, [groups, query]);

  const selected = groups.find((g) => g.group_id === value) ?? null;
  const triggerLabel = selected
    ? groupDisplayName(selected)
    : groups.length === 0
      ? "(尚無可用群組)"
      : "請選擇群組";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={groups.length === 0}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-border bg-white px-2.5 text-left text-[13px] outline-none focus:border-orange disabled:bg-bg disabled:text-gray-300",
            !selected && groups.length > 0 && "text-gray-300",
          )}
        >
          <span className="truncate">{triggerLabel}</span>
          <span className="shrink-0 text-gray-300">▾</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          // z-index must beat the host Modal's overlay (Radix Dialog
          // uses 50; bump well past it).
          className="z-[1100] w-[var(--radix-popover-trigger-width)] rounded-xl border border-border bg-white p-2 shadow-md"
        >
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="搜尋群組名稱、暱稱或 ID"
            className="mb-2 h-9 w-full rounded-lg border border-border px-2.5 text-[13px] outline-none focus:border-orange"
          />
          <div className="text-[11px] text-gray-300 px-1 pb-1">
            {filtered.length} / {groups.length} 個群組
          </div>
          <div className="max-h-[260px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-center text-[12px] text-gray-300">無符合的群組</div>
            ) : (
              filtered.map((g) => {
                const active = g.group_id === value;
                const primary = groupDisplayName(g);
                const showNickname =
                  g.group_name?.trim() && g.label?.trim() && g.label.trim() !== g.group_name.trim();
                return (
                  <button
                    key={g.group_id}
                    type="button"
                    onClick={() => {
                      onChange(g.group_id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left",
                      active ? "bg-orange-bg text-orange" : "text-ink hover:bg-orange-bg",
                    )}
                  >
                    <span className="w-full truncate text-[13px] font-semibold">{primary}</span>
                    {showNickname && (
                      <span className="w-full truncate text-[11px] text-gray-500">
                        暱稱:{g.label}
                      </span>
                    )}
                    <span className="w-full truncate font-mono text-[10px] text-gray-300">
                      {g.group_id}
                    </span>
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
