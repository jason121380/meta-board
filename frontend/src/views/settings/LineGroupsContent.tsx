import type { LinePushConfig, LinePushDateRange } from "@/api/client";
import {
  useLineGroupPushConfigs,
  useLineGroups,
  useRefreshLineGroupName,
  useUpdateLineGroupLabel,
} from "@/api/hooks/useLinePush";
import { Button } from "@/components/Button";
import { toast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import { useEffect, useState } from "react";
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
  if (cfg.frequency === "weekly") {
    const days = (cfg.weekdays ?? []).map((d) => `週${WEEKDAY_LABELS[d] ?? "?"}`).join("、");
    return `${days || "每週"} ${time}`;
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
 * Table layout (no per-row card chrome):
 *   群組(主名稱 + ID + 弱化暱稱輸入) | 已設定的推播 | 操作
 */
export function LineGroupsContent() {
  const groupsQuery = useLineGroups();
  const renameMutation = useUpdateLineGroupLabel();
  const refreshNameMutation = useRefreshLineGroupName();
  const groups = groupsQuery.data ?? [];
  const [editTarget, setEditTarget] = useState<EditTarget>(null);

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
      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full min-w-[520px] border-collapse text-[13px]">
          <thead className="border-b border-border bg-bg text-left">
            <tr>
              <th className="px-3 py-2 font-semibold text-gray-500">群組</th>
              <th className="px-3 py-2 font-semibold text-gray-500">已設定的推播</th>
              <th className="w-[110px] px-3 py-2 text-right font-semibold text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const displayName = g.group_name?.trim() || g.label?.trim() || g.group_id;
              return (
                <GroupRow
                  key={g.group_id}
                  group={g}
                  saving={renameMutation.isPending}
                  refreshing={refreshNameMutation.isPending}
                  onSave={async (label) => {
                    try {
                      await renameMutation.mutateAsync({ groupId: g.group_id, label });
                      toast("已更新群組暱稱", "success");
                    } catch (e) {
                      toast(
                        `更新失敗：${e instanceof Error ? e.message : String(e)}`,
                        "error",
                        4500,
                      );
                    }
                  }}
                  onRefreshName={async () => {
                    try {
                      const res = await refreshNameMutation.mutateAsync(g.group_id);
                      toast(
                        res.group_name ? `已更新群組名稱:${res.group_name}` : "群組名稱為空",
                        "success",
                      );
                    } catch (e) {
                      toast(
                        `抓取失敗:${e instanceof Error ? e.message : String(e)}`,
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
            })}
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
  onRefreshName,
  onAddPush,
  onEditPush,
  saving,
  refreshing,
}: {
  group: LineGroup;
  onSave: (label: string) => Promise<void> | void;
  onRefreshName: () => Promise<void> | void;
  onAddPush: () => void;
  onEditPush: (cfg: LinePushConfig) => void;
  saving: boolean;
  refreshing: boolean;
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

      {/* 操作 */}
      <td className="px-3 py-2.5 text-right">
        <Button
          variant="ghost"
          size="sm"
          disabled={refreshing || left}
          onClick={() => onRefreshName()}
          className="px-2 text-[11px]"
          title="從 LINE 重新抓取群組名稱"
        >
          {refreshing ? "抓取中..." : "重新抓取"}
        </Button>
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
          {configs.map((cfg) => {
            const name = cfg.campaign_nickname?.trim() || cfg.campaign_id;
            const dateLabel = DATE_RANGE_LABELS[cfg.date_range] ?? cfg.date_range;
            const rule = formatPushRule(cfg);
            return (
              <li
                key={cfg.id}
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
                <button
                  type="button"
                  onClick={() => onEdit(cfg)}
                  className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-gray-500 hover:border-orange hover:text-orange"
                >
                  編輯
                </button>
              </li>
            );
          })}
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
