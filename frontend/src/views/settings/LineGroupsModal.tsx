import { Modal } from "@/components/Modal";
import { LineGroupsContent } from "./LineGroupsContent";

/**
 * Modal wrapper around `LineGroupsContent` for legacy / inline entry
 * points. Standalone page entry lives in `LinePushSettingsView`.
 */

interface LineGroupsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LineGroupsModal({ open, onOpenChange }: LineGroupsModalProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="LINE 群組管理"
      subtitle="編輯群組暱稱;群組由 LINE bot 加入時自動登錄"
      width={520}
    >
      <LineGroupsContent />
    </Modal>
  );
}
