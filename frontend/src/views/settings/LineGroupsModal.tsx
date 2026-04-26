import { useLineGroups, useUpdateLineGroupLabel } from "@/api/hooks/useLinePush";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import { useEffect, useState } from "react";

/**
 * Standalone management dialog for LINE groups the bot has joined.
 *
 * Same group label edit affordance as the inline one inside
 * `LinePushModal`, but exposed up-front in Settings so operators can
 * tidy the labels without first opening a campaign's push dialog.
 *
 * Empty state: short instructions on how to invite the bot.
 *
 * The list shows every row from `line_groups` — including ones the
 * bot has been kicked out of (greyed out, "已退出" tag). We never
 * delete those rows so existing push configs keep their FK target.
 */

interface LineGroupsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LineGroupsModal({ open, onOpenChange }: LineGroupsModalProps) {
  const groupsQuery = useLineGroups();
  const renameMutation = useUpdateLineGroupLabel();
  const groups = groupsQuery.data ?? [];

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="LINE 群組管理"
      subtitle="編輯群組暱稱;群組由 LINE bot 加入時自動登錄"
      width={520}
    >
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
    </Modal>
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
  // Keep the local draft in sync if the underlying data changes
  // (eg. webhook updates joined_at after a re-join while the modal
  // is open).
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
