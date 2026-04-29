import type { LinePushConfig, LinePushDateRange } from "@/api/client";
import {
  useDeleteLinePushConfig,
  useLineGroupPushConfigs,
  useLineGroups,
  useTestLinePush,
  useUpdateLineGroupLabel,
} from "@/api/hooks/useLinePush";
import { confirm } from "@/components/ConfirmDialog";
import { toast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import { useEffect, useMemo, useState } from "react";
import { GroupPushConfigModal } from "./GroupPushConfigModal";

type EditTarget = {
  groupId: string;
  groupDisplayName: string;
  editing: LinePushConfig | null;
} | null;

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

const DATE_RANGE_LABELS: Record<LinePushDateRange, string> = {
  yesterday: "昨日",
  last_7d: "過去 7 天",
  last_14d: "過去 14 天",
  last_30d: "過去 30 天",
  this_month: "本月",
  month_to_yesterday: "本月1日-昨日",
};

function formatPushRule(cfg: LinePushConfig): string {
  const time = `${String(cfg.hour).padStart(2, "0")}:${String(cfg.minute).padStart(2, "0")}`;
  if (cfg.frequency === "daily") return `每日 ${time}`;
  if (cfg.frequency === "weekly" || cfg.frequency === "biweekly") {
    const prefix = cfg.frequency === "biweekly" ? "雙週" : "";
    const days = (cfg.weekdays ?? []).map((d) => `週${WEEKDAY_LABELS[d] ?? "?"}`).join("、");
    const fallback = cfg.frequency === "biweekly" ? "" : "每週";
    return `${prefix}${days || fallback} ${time}`;
  }
  return `每月 ${cfg.month_day ?? 1} 日 ${time}`;
}

interface LineGroup {
  group_id: string;
  group_name: string;
  label: string;
  joined_at: string | null;
  left_at: string | null;
}

/**
 * Shared list UI for LINE groups the bot has joined. Used both by
 * the inline `LineGroupsModal` (Dashboard / legacy entry) and the
 * standalone `LinePushSettingsView` page.
 *
 * Two-column table (no per-row "重新抓取" action — the lifespan
 * backfill on startup keeps `group_name` filled in automatically):
 *   群組(主名稱 + ID + 弱化暱稱輸入) | 已設定的推播
 *
 * Top-of-page search filters by group_name / label / group_id —
 * essential when the bot is in dozens of groups.
 */
export function LineGroupsContent() {
  const groupsQuery = useLineGroups();
  const renameMutation = useUpdateLineGroupLabel();
  const groups = groupsQuery.data ?? [];
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        (g.group_name ?? "").toLowerCase().includes(q) ||
        (g.label ?? "").toLowerCase().includes(q) ||
        g.group_id.toLowerCase().includes(q),
    );
  }, [groups, query]);

  if (groupsQuery.isLoading) {
    return (
      <div className="rounded-xl border border-border bg-bg px-3 py-4 text-center text-[13px] text-gray-500">
        載入中...
      </div>
    );
  }

  if (groupsQuery.isSuccess && groups.length === 0) {
    return (
      <div className="rounded-xl bg-orange-bg px-3 py-3 text-[13px] text-ink">
        尚未偵測到任何 LINE 群組。請把 LINE 官方帳號加入您要推播的群組,bot 會在收到 join
        事件時自動把群組登錄進來。
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="搜尋群組名稱、暱稱或 ID"
          className="h-9 w-full rounded-lg border border-border bg-white px-3 text-[13px] outline-none focus:border-orange"
        />
        <span className="shrink-0 text-[11px] text-gray-300">
          {filtered.length} / {groups.length}
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full min-w-[480px] border-collapse text-[13px]">
          <thead className="border-b border-border bg-bg text-left">
            <tr>
              <th className="px-3 py-2 font-semibold text-gray-500">群組</th>
              <th className="px-3 py-2 font-semibold text-gray-500">已設定的推播</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-center text-[12px] text-gray-300" colSpan={2}>
                  無符合搜尋條件的群組
                </td>
              </tr>
            ) : (
              filtered.map((g) => {
                const displayName = g.group_name?.trim() || g.label?.trim() || g.group_id;
                return (
                  <GroupRow
                    key={g.group_id}
                    group={g}
                    saving={renameMutation.isPending}
                    onSave={async (label) => {
                      try {
                        await renameMutation.mutateAsync({ groupId: g.group_id, label });
                        toast("已更新群組暱稱", "success");
                      } catch (e) {
                        toast(
                          `更新失敗:${e instanceof Error ? e.message : String(e)}`,
                          "error",
                          4500,
                        );
                      }
                    }}
                    onAddPush={() =>
                      setEditTarget({
                        groupId: g.group_id,
                        groupDisplayName: displayName,
                        editing: null,
                      })
                    }
                    onEditPush={(cfg) =>
                      setEditTarget({
                        groupId: g.group_id,
                        groupDisplayName: displayName,
                        editing: cfg,
                      })
                    }
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {editTarget && (
        <GroupPushConfigModal
          open={!!editTarget}
          onOpenChange={(o) => {
            if (!o) setEditTarget(null);
          }}
          groupId={editTarget.groupId}
          groupDisplayName={editTarget.groupDisplayName}
          editing={editTarget.editing}
        />
      )}
    </>
  );
}

function GroupRow({
  group,
  onSave,
  onAddPush,
  onEditPush,
  saving,
}: {
  group: LineGroup;
  onSave: (label: string) => Promise<void> | void;
  onAddPush: () => void;
  onEditPush: (cfg: LinePushConfig) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(group.label ?? "");
  useEffect(() => {
    setDraft(group.label ?? "");
  }, [group.label]);

  const dirty = draft.trim() !== (group.label ?? "").trim();
  const left = !!group.left_at;
  const displayName = group.group_name?.trim() || "（尚未取得群組名稱）";
  const hasName = !!group.group_name?.trim();

  return (
    <tr className={cn("border-b border-border last:border-b-0 align-top", left && "opacity-60")}>
      {/* 群組欄: 名稱(主) + ID(mono 小) + 暱稱(弱化 inline) */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className={cn("truncate font-bold", hasName ? "text-ink" : "text-gray-300")}
            title={displayName}
          >
            {displayName}
          </span>
          {left && (
            <span className="rounded-full bg-red-bg px-1.5 py-[1px] text-[10px] font-semibold text-red">
              已退出
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-gray-300">{group.group_id}</div>
        {/* Nickname — visually de-emphasised: small inline row, no border on input */}
        <div className="mt-1 flex items-center gap-1">
          <span className="shrink-0 text-[10px] text-gray-300">暱稱</span>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
            placeholder="—"
            className="h-6 w-32 rounded border-0 bg-bg px-1.5 text-[11px] text-gray-500 outline-none focus:bg-white focus:ring-1 focus:ring-orange"
          />
          {dirty && (
            <button
              type="button"
              disabled={saving}
              onClick={() => onSave(draft.trim())}
              className="text-[10px] font-semibold text-orange disabled:opacity-50"
            >
              儲存
            </button>
          )}
        </div>
      </td>

      {/* 推播設定 */}
      <td className="px-3 py-2.5">
        <GroupPushConfigsList
          groupId={group.group_id}
          onEdit={onEditPush}
          onAdd={left ? undefined : onAddPush}
        />
      </td>
    </tr>
  );
}

function GroupPushConfigsList({
  groupId,
  onEdit,
  onAdd,
}: {
  groupId: string;
  onEdit: (cfg: LinePushConfig) => void;
  /** Optional: omit when the bot has left the group (cannot create new). */
  onAdd?: () => void;
}) {
  const query = useLineGroupPushConfigs(groupId);
  const configs = query.data ?? [];

  return (
    <div className="flex flex-col gap-1.5">
      {query.isLoading ? (
        <div className="text-[11px] text-gray-300">載入中...</div>
      ) : configs.length === 0 ? (
        <div className="text-[11px] text-gray-300">尚無推播設定</div>
      ) : (
        <ul className="flex flex-col gap-1">
          {configs.map((cfg) => (
            <PushConfigRow key={cfg.id} cfg={cfg} onEdit={onEdit} />
          ))}
        </ul>
      )}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="self-start rounded-md border border-dashed border-border px-2 py-0.5 text-[11px] text-gray-500 hover:border-orange hover:text-orange"
        >
          + 新增推播
        </button>
      )}
    </div>
  );
}

function PushConfigRow({
  cfg,
  onEdit,
}: {
  cfg: LinePushConfig & { campaign_nickname?: string };
  onEdit: (cfg: LinePushConfig) => void;
}) {
  const name = cfg.campaign_nickname?.trim() || cfg.campaign_id;
  const dateLabel = DATE_RANGE_LABELS[cfg.date_range] ?? cfg.date_range;
  const rule = formatPushRule(cfg);
  const deleteMutation = useDeleteLinePushConfig();
  const testMutation = useTestLinePush();

  const onUnbind = async () => {
    const ok = await confirm(`確定要解除「${name}」的推播綁定？`);
    if (!ok) return;
    try {
      await deleteMutation.mutateAsync(cfg.id);
      toast("已解除推播", "success");
    } catch (e) {
      toast(`解除失敗:${e instanceof Error ? e.message : String(e)}`, "error", 4500);
    }
  };

  const onTest = async () => {
    try {
      await testMutation.mutateAsync(cfg.id);
      toast(`已發送測試推播到「${name}」`, "success");
    } catch (e) {
      toast(`測試失敗:${e instanceof Error ? e.message : String(e)}`, "error", 4500);
    }
  };

  return (
    <li
      className={cn(
        "group/row flex items-start justify-between gap-2 rounded-md px-1 py-0.5 hover:bg-bg",
        !cfg.enabled && "opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[12px] font-semibold text-ink">{name}</span>
          {!cfg.enabled && (
            <span className="shrink-0 rounded-full bg-red-bg px-1.5 py-[1px] text-[10px] font-semibold text-red">
              已停用
            </span>
          )}
        </div>
        <div className="text-[11px] text-gray-500">
          {rule} · {dateLabel}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onEdit(cfg)}
          className="rounded border border-border px-1.5 py-0.5 text-[10px] text-gray-500 hover:border-orange hover:text-orange"
        >
          編輯
        </button>
        <button
          type="button"
          onClick={onTest}
          disabled={testMutation.isPending}
          className="rounded border border-border px-1.5 py-0.5 text-[10px] text-orange hover:border-orange hover:bg-orange-bg disabled:opacity-50"
        >
          {testMutation.isPending ? "發送中" : "測試"}
        </button>
        <button
          type="button"
          onClick={onUnbind}
          disabled={deleteMutation.isPending}
          className="rounded border border-border px-1.5 py-0.5 text-[10px] text-red hover:border-red hover:bg-red-bg disabled:opacity-50"
        >
          {deleteMutation.isPending ? "解除中" : "解除綁定"}
        </button>
      </div>
    </li>
  );
}
