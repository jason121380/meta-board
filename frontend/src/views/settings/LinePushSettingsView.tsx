import { Topbar } from "@/layout/Topbar";
import { LineGroupsContent } from "./LineGroupsContent";

/**
 * LINE 推播設定 — standalone page version of `LineGroupsModal`.
 *
 * Sidebar entry under 工具. Lets operators tidy LINE group labels
 * without first opening Settings or a campaign's push dialog.
 */
export function LinePushSettingsView() {
  return (
    <>
      <Topbar title="LINE 推播設定" />
      <div className="flex-1 overflow-y-auto bg-bg">
        <div className="mx-auto w-full max-w-[640px] px-4 py-5 md:px-6 md:py-6">
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
