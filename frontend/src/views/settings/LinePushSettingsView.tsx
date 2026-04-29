import { api } from "@/api/client";
import { Button } from "@/components/Button";
import { toast } from "@/components/Toast";
import { Topbar } from "@/layout/Topbar";
import { cn } from "@/lib/cn";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LineGroupsContent } from "./LineGroupsContent";

/**
 * LINE 推播設定 — standalone page version of `LineGroupsModal`.
 *
 * Sidebar entry under 工具. Lets operators tidy LINE group labels
 * without first opening Settings or a campaign's push dialog.
 */
export function LinePushSettingsView() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // Bulk refresh first — re-pulls each group's display name from
      // LINE AND auto-marks groups the bot can't see anymore (kicked
      // / 404) as left, so they drop out of the next GET. Then
      // refetch the local queries to reflect the new DB state.
      const result = await api.linePush.refreshAllGroups();
      await Promise.all([
        qc.refetchQueries({ queryKey: ["lineGroups"] }),
        qc.refetchQueries({ queryKey: ["lineGroupConfigs"] }),
      ]);
      const parts = [`已更新 ${result.refreshed} 個群組名稱`];
      if (result.marked_left > 0) parts.push(`移除 ${result.marked_left} 個已退出群組`);
      toast(parts.join("、"), "success");
    } catch (e) {
      toast(`重新整理失敗:${e instanceof Error ? e.message : String(e)}`, "error", 4500);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <Topbar title="LINE 推播設定">
        <Button
          variant="ghost"
          size="sm"
          title="重新整理"
          aria-label="重新整理"
          onClick={onRefresh}
          disabled={refreshing}
          className="h-10 w-10 justify-center px-0 md:h-[30px] md:w-[30px]"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={cn("block", refreshing && "animate-spin")}
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </Button>
      </Topbar>
      <div className="flex-1 overflow-y-auto bg-bg">
        <div className="mx-auto w-full max-w-[1100px] px-4 py-5 md:px-6 md:py-6">
          <div className="mb-4">
            <div className="text-[15px] font-bold text-ink">LINE 群組管理</div>
            <div className="mt-0.5 text-[12px] text-gray-500">
              編輯群組暱稱;群組由 LINE bot 加入時自動登錄
            </div>
          </div>
          <LineGroupsContent />
        </div>
      </div>
    </>
  );
}
