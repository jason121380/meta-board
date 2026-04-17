import { type SetNicknameInput, useSetNickname } from "@/api/hooks/useNicknames";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { useEffect, useState } from "react";

/**
 * Modal for editing a single campaign's store + designer nicknames.
 * Persists via POST /api/nicknames/{id} (PostgreSQL-backed, shared
 * globally across users).
 *
 * Empty-out-both-fields is treated as a delete by the backend so
 * the row never lingers as a ghost entry.
 */

export interface NicknameEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
  initialStore: string;
  initialDesigner: string;
}

export function NicknameEditModal({
  open,
  onOpenChange,
  campaignId,
  campaignName,
  initialStore,
  initialDesigner,
}: NicknameEditModalProps) {
  const [store, setStore] = useState(initialStore);
  const [designer, setDesigner] = useState(initialDesigner);
  const setNickname = useSetNickname();

  // Reset fields each time the modal re-opens with a different row.
  useEffect(() => {
    if (open) {
      setStore(initialStore);
      setDesigner(initialDesigner);
    }
  }, [open, initialStore, initialDesigner]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: SetNicknameInput = { campaignId, store, designer };
    setNickname.mutate(input, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="編輯暱稱"
      subtitle={campaignName}
      width={380}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-gray-500">店家</span>
          <input
            value={store}
            onChange={(e) => setStore(e.currentTarget.value)}
            placeholder="店家暱稱"
            className="h-10 rounded-lg border-[1.5px] border-border px-3 text-[13px] outline-none focus:border-orange"
            maxLength={100}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-gray-500">設計師</span>
          <input
            value={designer}
            onChange={(e) => setDesigner(e.currentTarget.value)}
            placeholder="設計師暱稱"
            className="h-10 rounded-lg border-[1.5px] border-border px-3 text-[13px] outline-none focus:border-orange"
            maxLength={100}
          />
        </label>
        {setNickname.isError && (
          <p className="text-xs text-red-600">
            儲存失敗：{setNickname.error instanceof Error ? setNickname.error.message : "未知錯誤"}
          </p>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={setNickname.isPending}
          >
            取消
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={setNickname.isPending}>
            {setNickname.isPending ? "儲存中..." : "儲存"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
