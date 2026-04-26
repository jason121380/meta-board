import {
  useLineGroups,
  useRefreshLineGroupName,
  useUpdateLineGroupLabel,
} from "@/api/hooks/useLinePush";
import { Button } from "@/components/Button";
import { toast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import { useEffect, useState } from "react";

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
 * Display priority (top to bottom):
 *   1. group_name — real LINE-side display name (from API summary)
 *   2. label      — user-editable nickname (input field)
 *   3. group_id   — system identifier (small mono, secondary)
 */
export function LineGroupsContent() {
  const groupsQuery = useLineGroups();
  const renameMutation = useUpdateLineGroupLabel();
  const refreshNameMutation = useRefreshLineGroupName();
  const groups = groupsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      {groupsQuery.isLoading && (
        <div className="rounded-xl border border-border bg-bg px-3 py-4 text-center text-[13px] text-gray-500">
          載入中...
        </div>
      )}

      {groupsQuery.isSuccess && groups.length === 0 && (
        <div className="rounded-xl bg-orange-bg px-3 py-3 text-[13px] text-ink">
          尚未偵測到任何 LINE 群組。請把 LINE 官方帳號加入您要推播的群組,bot 會在收到 join
          事件時自動把群組登錄進來。
        </div>
      )}

      {groups.length > 0 && (
        <div className="flex flex-col gap-2">
          {groups.map((g) => (
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
                  toast(`更新失敗：${e instanceof Error ? e.message : String(e)}`, "error", 4500);
                }
              }}
              onRefreshName={async () => {
                try {
                  const res = await refreshNameMutation.mutateAsync(g.group_id);
                  toast(
                    res.group_name ? `已更新群組名稱：${res.group_name}` : "群組名稱為空",
                    "success",
                  );
                } catch (e) {
                  toast(`抓取失敗：${e instanceof Error ? e.message : String(e)}`, "error", 4500);
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupRow({
  group,
  onSave,
  onRefreshName,
  saving,
  refreshing,
}: {
  group: LineGroup;
  onSave: (label: string) => Promise<void> | void;
  onRefreshName: () => Promise<void> | void;
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
    <div className={cn("rounded-xl border border-border bg-white px-3 py-3", left && "opacity-60")}>
      {/* 1. Real LINE group display name — primary, bold */}
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex-1 truncate text-[14px] font-bold",
            hasName ? "text-ink" : "text-gray-300",
          )}
          title={displayName}
        >
          {displayName}
        </div>
        {left && (
          <span className="rounded-full bg-red-bg px-1.5 py-[1px] text-[10px] font-semibold text-red">
            已退出
          </span>
        )}
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
      </div>

      {/* 2. User-editable nickname (label) */}
      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          placeholder="自訂暱稱（選填，例：客戶 A 群組）"
          className="h-9 flex-1 rounded-lg border border-border px-2.5 text-[13px] outline-none focus:border-orange"
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={!dirty || saving}
          onClick={() => onSave(draft.trim())}
        >
          儲存
        </Button>
      </div>

      {/* 3. group_id — secondary, mono small */}
      <div className="mt-1.5 text-[11px] text-gray-300">
        <span className="font-mono">{group.group_id}</span>
      </div>
    </div>
  );
}
