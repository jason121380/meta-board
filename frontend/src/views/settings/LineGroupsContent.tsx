import { useLineGroups, useUpdateLineGroupLabel } from "@/api/hooks/useLinePush";
import { Button } from "@/components/Button";
import { toast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import { useEffect, useState } from "react";

/**
 * Shared list UI for LINE groups the bot has joined. Used both by
 * the inline `LineGroupsModal` (Dashboard / legacy entry) and the
 * standalone `LinePushSettingsView` page.
 */
export function LineGroupsContent() {
  const groupsQuery = useLineGroups();
  const renameMutation = useUpdateLineGroupLabel();
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
              onSave={async (label) => {
                try {
                  await renameMutation.mutateAsync({ groupId: g.group_id, label });
                  toast("已更新群組暱稱", "success");
                } catch (e) {
                  toast(`更新失敗：${e instanceof Error ? e.message : String(e)}`, "error", 4500);
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
  saving,
}: {
  group: { group_id: string; label: string; joined_at: string | null; left_at: string | null };
  onSave: (label: string) => Promise<void> | void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(group.label ?? "");
  useEffect(() => {
    setDraft(group.label ?? "");
  }, [group.label]);

  const dirty = draft.trim() !== (group.label ?? "").trim();
  const left = !!group.left_at;

  return (
    <div className={cn("rounded-xl border border-border bg-white px-3 py-3", left && "opacity-60")}>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          placeholder="群組暱稱（例：客戶 A 群組）"
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
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-300">
        <span className="font-mono">{group.group_id}</span>
        {left && (
          <span className="rounded-full bg-red-bg px-1.5 py-[1px] text-[10px] font-semibold text-red">
            已退出
          </span>
        )}
      </div>
    </div>
  );
}
