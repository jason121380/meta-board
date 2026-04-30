import {
  useClaimLineChannel,
  useCreateLineChannel,
  useDeleteLineChannel,
  useLineChannels,
  useUpdateLineChannel,
} from "@/api/hooks/useLinePush";
import { Button } from "@/components/Button";
import { confirm } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import { useEffect, useState } from "react";

interface ChannelRow {
  id: string;
  name: string;
  channel_secret_masked: string;
  access_token_masked: string;
  enabled: boolean;
  is_default: boolean;
  is_orphan: boolean;
  editable: boolean;
  webhook_url: string;
}

/**
 * 「LINE 官方帳號設定」 — manages multiple OAs we can push from.
 * Renders above the group table on the LINE 推播設定 page.
 *
 * Tokens are masked server-side; the edit modal accepts empty
 * secret/token fields meaning "keep existing", so we never have to
 * show or transit the real values once saved. Each row shows the
 * webhook URL the user must paste into LINE Developers Console
 * when adding a new OA.
 */
export function LineChannelsContent() {
  const channelsQuery = useLineChannels();
  const channels = channelsQuery.data ?? [];
  const [editing, setEditing] = useState<ChannelRow | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="text-[13px] font-bold text-ink">LINE 官方帳號</div>
        <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
          + 新增官方帳號
        </Button>
      </div>

      {channelsQuery.isLoading ? (
        <div className="px-3 py-4 text-center text-[12px] text-gray-500">載入中...</div>
      ) : channels.length === 0 ? (
        <div className="px-3 py-4 text-center text-[12px] text-gray-500">
          尚未設定官方帳號 — 請先新增至少一個
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {channels.map((c) => (
            <ChannelRow key={c.id} channel={c} onEdit={() => setEditing(c)} />
          ))}
        </ul>
      )}

      {creating && <ChannelEditModal mode="create" onClose={() => setCreating(false)} />}
      {editing && (
        <ChannelEditModal mode="edit" channel={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function ChannelRow({ channel, onEdit }: { channel: ChannelRow; onEdit: () => void }) {
  const deleteMutation = useDeleteLineChannel();
  const claimMutation = useClaimLineChannel();

  const onCopyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(channel.webhook_url);
      toast("已複製 Webhook URL", "success", 2000);
    } catch {
      toast("複製失敗,請手動選取", "error", 3000);
    }
  };

  const onDelete = async () => {
    const ok = await confirm(`確定刪除官方帳號「${channel.name}」？`);
    if (!ok) return;
    try {
      await deleteMutation.mutateAsync(channel.id);
      toast("已刪除", "success");
    } catch (e) {
      toast(`刪除失敗:${e instanceof Error ? e.message : String(e)}`, "error", 4500);
    }
  };

  const onClaim = async () => {
    const ok = await confirm(`認領「${channel.name}」這個官方帳號?認領後它會歸屬於你的 FB 帳號。`);
    if (!ok) return;
    try {
      await claimMutation.mutateAsync(channel.id);
      toast("已認領", "success");
    } catch (e) {
      toast(`認領失敗:${e instanceof Error ? e.message : String(e)}`, "error", 4500);
    }
  };

  return (
    <li className="flex flex-col gap-2 px-3 py-3">
      {/* Top row: name + chips on left, action buttons on right */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "truncate text-[13px] font-bold",
              (!channel.enabled || channel.is_orphan) && "text-gray-300",
            )}
          >
            {channel.name}
          </span>
          {channel.is_orphan && (
            <span
              className="shrink-0 whitespace-nowrap rounded-full bg-bg px-1.5 py-[1px] text-[10px] font-semibold text-gray-500"
              title="此官方帳號目前沒有擁有者(舊資料);點認領變成你的"
            >
              未指派
            </span>
          )}
          {channel.is_default && !channel.is_orphan && (
            <span className="shrink-0 whitespace-nowrap rounded-full bg-orange-bg px-1.5 py-[1px] text-[10px] font-semibold text-orange">
              預設
            </span>
          )}
          {!channel.enabled && (
            <span className="shrink-0 whitespace-nowrap rounded-full bg-red-bg px-1.5 py-[1px] text-[10px] font-semibold text-red">
              已停用
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {channel.is_orphan ? (
            <button
              type="button"
              onClick={onClaim}
              disabled={claimMutation.isPending}
              className="rounded border border-orange px-1.5 py-0.5 text-[10px] font-semibold text-orange hover:bg-orange-bg disabled:opacity-50"
            >
              {claimMutation.isPending ? "認領中..." : "認領"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="rounded border border-border px-1.5 py-0.5 text-[10px] text-gray-500 hover:border-orange hover:text-orange"
              >
                編輯
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={deleteMutation.isPending}
                className="rounded border border-border px-1.5 py-0.5 text-[10px] text-red hover:border-red hover:bg-red-bg disabled:opacity-50"
              >
                {deleteMutation.isPending ? "刪除中" : "刪除"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Webhook URL row — truncate, with copy button */}
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-[10px] text-gray-300">Webhook</span>
        <code
          className="min-w-0 flex-1 truncate rounded bg-bg px-1.5 py-0.5 font-mono text-[10px] text-gray-500"
          title={channel.webhook_url}
        >
          {channel.webhook_url}
        </code>
        <button
          type="button"
          onClick={onCopyWebhook}
          className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-gray-500 hover:border-orange hover:text-orange"
        >
          複製
        </button>
      </div>

      {/* Secret + token masked — single line, comma-separated */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-gray-300">
        <span>
          secret: <span className="font-mono">{channel.channel_secret_masked || "—"}</span>
        </span>
        <span>
          token: <span className="font-mono">{channel.access_token_masked || "—"}</span>
        </span>
      </div>
    </li>
  );
}

function ChannelEditModal({
  mode,
  channel,
  onClose,
}: {
  mode: "create" | "edit";
  channel?: ChannelRow;
  onClose: () => void;
}) {
  const createMutation = useCreateLineChannel();
  const updateMutation = useUpdateLineChannel();
  const [name, setName] = useState(channel?.name ?? "");
  const [secret, setSecret] = useState("");
  const [token, setToken] = useState("");
  const [enabled, setEnabled] = useState(channel?.enabled ?? true);
  const [isDefault, setIsDefault] = useState(channel?.is_default ?? false);

  useEffect(() => {
    if (channel) {
      setName(channel.name);
      setEnabled(channel.enabled);
      setIsDefault(channel.is_default);
    }
  }, [channel]);

  const pending = createMutation.isPending || updateMutation.isPending;

  const onSave = async () => {
    if (!name.trim()) {
      toast("請填寫名稱", "error");
      return;
    }
    if (mode === "create" && (!secret.trim() || !token.trim())) {
      toast("新增時 channel secret 與 access token 都必填", "error");
      return;
    }
    try {
      if (mode === "create") {
        await createMutation.mutateAsync({
          name: name.trim(),
          channel_secret: secret.trim(),
          access_token: token.trim(),
          enabled,
          is_default: isDefault,
        });
        toast("已新增官方帳號", "success");
      } else if (channel) {
        await updateMutation.mutateAsync({
          id: channel.id,
          body: {
            name: name.trim(),
            channel_secret: secret.trim(),
            access_token: token.trim(),
            enabled,
            is_default: isDefault,
          },
        });
        toast("已更新", "success");
      }
      onClose();
    } catch (e) {
      toast(`儲存失敗:${e instanceof Error ? e.message : String(e)}`, "error", 4500);
    }
  };

  return (
    <Modal
      open={true}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={mode === "create" ? "新增 LINE 官方帳號" : `編輯「${channel?.name ?? ""}」`}
      subtitle={
        mode === "edit"
          ? "secret / token 留空代表沿用既有值,只有要換才填"
          : "新增後會產生 webhook URL,請貼到 LINE Developers Console"
      }
    >
      <div className="flex flex-col gap-3 py-1">
        <Field label="名稱">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="例:LURE 主帳號"
            className="h-9 w-full rounded-lg border border-border bg-white px-2.5 text-[13px] outline-none focus:border-orange"
          />
        </Field>
        <Field label="Channel Secret">
          <input
            type="text"
            value={secret}
            onChange={(e) => setSecret(e.currentTarget.value)}
            placeholder={mode === "edit" ? "（保留不變）" : "從 LINE Developers Console 複製"}
            className="h-9 w-full rounded-lg border border-border bg-white px-2.5 font-mono text-[12px] outline-none focus:border-orange"
          />
        </Field>
        <Field label="Channel Access Token">
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.currentTarget.value)}
            placeholder={mode === "edit" ? "（保留不變）" : "Long-lived channel access token"}
            className="h-9 w-full rounded-lg border border-border bg-white px-2.5 font-mono text-[12px] outline-none focus:border-orange"
          />
        </Field>
        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-ink">
            <input
              type="checkbox"
              className="custom-cb"
              checked={enabled}
              onChange={(e) => setEnabled(e.currentTarget.checked)}
            />
            啟用
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-ink">
            <input
              type="checkbox"
              className="custom-cb"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.currentTarget.checked)}
            />
            設為預設(舊版 webhook URL 會路由到這個)
          </label>
        </div>
        <div className="mt-1 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" size="sm" onClick={onSave} disabled={pending}>
            {pending ? "儲存中..." : "儲存"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-gray-500">{label}</span>
      {children}
    </label>
  );
}
