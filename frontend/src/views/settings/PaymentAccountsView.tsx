import { Button } from "@/components/Button";
import { confirm } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "@/components/Toast";
import { Topbar } from "@/layout/Topbar";
import { type PaymentAccount, usePaymentStore } from "@/stores/paymentStore";
import { useState } from "react";

/**
 * 收款帳戶設定 — manages bank accounts used on the Finance 請款單
 * (invoice) download. Stored team-wide via shared_settings key
 * `payment_accounts`. Multiple entries supported.
 *
 * Each row exposes inline edit + delete. A new row starts empty and
 * is committed to the server on first field blur (the store debounce
 * isn't needed here — additions/deletions are click-driven).
 */

interface DraftAccount {
  bank: string;
  branch: string;
  holder: string;
  accountNo: string;
}

const EMPTY_DRAFT: DraftAccount = { bank: "", branch: "", holder: "", accountNo: "" };

export function PaymentAccountsView() {
  const accounts = usePaymentStore((s) => s.accounts);
  const addAccount = usePaymentStore((s) => s.addAccount);
  const updateAccount = usePaymentStore((s) => s.updateAccount);
  const removeAccount = usePaymentStore((s) => s.removeAccount);

  const [draft, setDraft] = useState<DraftAccount>(EMPTY_DRAFT);

  const onAdd = () => {
    const bank = draft.bank.trim();
    const accountNo = draft.accountNo.trim();
    if (!bank || !accountNo) {
      toast("請至少填寫銀行與帳號", "error");
      return;
    }
    addAccount({
      bank,
      branch: draft.branch.trim(),
      holder: draft.holder.trim(),
      accountNo,
    });
    setDraft(EMPTY_DRAFT);
    toast("已新增收款帳戶");
  };

  const onRemove = async (acc: PaymentAccount) => {
    const ok = await confirm(`確定要刪除「${acc.bank} - ${acc.accountNo}」？`);
    if (!ok) return;
    removeAccount(acc.id);
    toast("已刪除");
  };

  return (
    <>
      <Topbar title="收款帳戶設定" />
      <div className="flex flex-1 flex-col overflow-y-auto bg-bg px-3 py-3 md:px-5 md:py-5">
        <div className="mx-auto flex w-full max-w-[820px] flex-col gap-4">
          {/* New account form */}
          <section className="rounded-2xl border border-border bg-white p-4 md:p-5">
            <div className="mb-3 text-[13px] font-bold text-ink">新增收款帳戶</div>
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              <Field
                label="銀行"
                value={draft.bank}
                onChange={(v) => setDraft((d) => ({ ...d, bank: v }))}
                placeholder="例: 國泰世華"
              />
              <Field
                label="分行"
                value={draft.branch}
                onChange={(v) => setDraft((d) => ({ ...d, branch: v }))}
                placeholder="例: 民生分行"
              />
              <Field
                label="戶名"
                value={draft.holder}
                onChange={(v) => setDraft((d) => ({ ...d, holder: v }))}
                placeholder="例: LURE 行銷有限公司"
              />
              <Field
                label="帳號"
                value={draft.accountNo}
                onChange={(v) => setDraft((d) => ({ ...d, accountNo: v }))}
                placeholder="例: 123-456-789012"
              />
            </div>
            <div className="mt-3 flex justify-end">
              <Button variant="primary" size="sm" onClick={onAdd}>
                新增
              </Button>
            </div>
          </section>

          {/* Existing accounts */}
          <section className="rounded-2xl border border-border bg-white">
            <div className="border-b border-border px-4 py-3 text-[13px] font-bold text-ink md:px-5">
              已設定的收款帳戶（{accounts.length}）
            </div>
            {accounts.length === 0 ? (
              <EmptyState>尚未設定任何收款帳戶</EmptyState>
            ) : (
              <div className="flex flex-col">
                {accounts.map((acc) => (
                  <AccountRow
                    key={acc.id}
                    account={acc}
                    onUpdate={(patch) => updateAccount(acc.id, patch)}
                    onRemove={() => onRemove(acc)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-gray-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        className="h-10 rounded-lg border-[1.5px] border-border bg-white px-3 text-[13px] outline-none focus:border-orange md:h-9"
      />
    </label>
  );
}

function AccountRow({
  account,
  onUpdate,
  onRemove,
}: {
  account: PaymentAccount;
  onUpdate: (patch: Partial<Omit<PaymentAccount, "id">>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[1fr_1fr_1fr_1fr_auto] md:items-end md:px-5">
      <Field label="銀行" value={account.bank} onChange={(v) => onUpdate({ bank: v })} />
      <Field label="分行" value={account.branch} onChange={(v) => onUpdate({ branch: v })} />
      <Field label="戶名" value={account.holder} onChange={(v) => onUpdate({ holder: v })} />
      <Field label="帳號" value={account.accountNo} onChange={(v) => onUpdate({ accountNo: v })} />
      <div className="flex justify-end md:pb-[1px]">
        <Button variant="danger" size="sm" onClick={onRemove}>
          刪除
        </Button>
      </div>
    </div>
  );
}
