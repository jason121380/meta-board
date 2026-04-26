import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { toast } from "@/components/Toast";
import { type DateConfig, resolveRange } from "@/lib/datePicker";
import { fM, fN, fP } from "@/lib/format";
import { getIns, getMsgCount, spendOf } from "@/lib/insights";
import { type PaymentAccount, usePaymentStore } from "@/stores/paymentStore";
import type { FbCampaign } from "@/types/fb";
import { toJpeg } from "html-to-image";
import { forwardRef, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { spendPlus } from "./financeData";

/**
 * 請款單 (Invoice) modal.
 *
 * Two-step flow:
 *   1. Pick a 收款帳戶 from the user's saved list (PaymentStore).
 *   2. Render the invoice preview, click 下載 JPG to export.
 *
 * If no payment accounts are configured, the user is sent to
 * /payment-accounts to create one (link opens in same tab; the modal
 * is dismissed).
 *
 * Image export: html-to-image's `toJpeg` rasterises the DOM node at
 * 2x scale for retina sharpness, then triggers a download via an
 * anchor click. Filename embeds campaign name + date label.
 */

export interface InvoiceModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campaign: FbCampaign | null;
  date: DateConfig;
  markup: number;
}

export function InvoiceModal({ open, onOpenChange, campaign, date, markup }: InvoiceModalProps) {
  const accounts = usePaymentStore((s) => s.accounts);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  if (!campaign) return null;

  const selected = accounts.find((a) => a.id === selectedId) ?? null;

  const handleDownload = async () => {
    if (!previewRef.current || !selected) return;
    setDownloading(true);
    try {
      const dataUrl = await toJpeg(previewRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        cacheBust: true,
      });
      const safeName = campaign.name.replace(/[\\/:*?"<>|]/g, "_");
      const { start, end } = resolveRange(date);
      const safeDate = start === end ? start : `${start}_${end}`;
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `請款單_${safeName}_${safeDate}.jpg`;
      a.click();
      toast("已下載請款單");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "未知錯誤";
      toast(`下載失敗:${msg}`, "error");
    } finally {
      setDownloading(false);
    }
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      setSelectedId(null);
    }
    onOpenChange(next);
  };

  return (
    <Modal
      open={open}
      onOpenChange={handleClose}
      title="請款單"
      subtitle={campaign.name}
      width={680}
      footer={
        selected ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
              重新選擇收款帳戶
            </Button>
            <Button variant="primary" size="sm" onClick={handleDownload} disabled={downloading}>
              {downloading ? "下載中..." : "下載 JPG"}
            </Button>
          </>
        ) : null
      }
    >
      {!selected ? (
        <PickAccount
          accounts={accounts}
          onPick={setSelectedId}
          onClose={() => onOpenChange(false)}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="text-[12px] text-gray-500">
            預覽如下,確認無誤後點下方「下載 JPG」即可儲存為圖片。
          </div>
          {downloading && (
            <div className="flex items-center gap-2 text-[12px] text-gray-500">
              <Spinner size={14} />
              產生圖片中...
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-border bg-bg p-2">
            <InvoicePreview
              ref={previewRef}
              campaign={campaign}
              date={date}
              markup={markup}
              account={selected}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

function PickAccount({
  accounts,
  onPick,
  onClose,
}: {
  accounts: PaymentAccount[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  if (accounts.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState>尚未設定任何收款帳戶,請先到「收款帳戶設定」新增至少一組帳戶</EmptyState>
        <div className="flex justify-end">
          <Link to="/payment-accounts" onClick={onClose}>
            <Button variant="primary" size="sm">
              前往設定
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[12px] text-gray-500">請選擇此次請款的收款帳戶</div>
      <div className="flex flex-col gap-2">
        {accounts.map((acc) => {
          // 別名優先顯示;沒有別名才 fallback 用銀行 + 分行
          const primary =
            acc.alias || `${acc.bank}${acc.branch ? ` · ${acc.branch}` : ""}` || "未命名帳戶";
          const showBankSubtitle = !!acc.alias && !!acc.bank;
          return (
            <button
              key={acc.id}
              type="button"
              onClick={() => onPick(acc.id)}
              className="flex flex-col items-start rounded-xl border-[1.5px] border-border bg-white px-3.5 py-3 text-left transition hover:border-orange hover:bg-orange-bg/40"
            >
              <div className="text-[14px] font-bold text-ink">{primary}</div>
              {showBankSubtitle && (
                <div className="mt-0.5 text-[11px] text-gray-300">
                  {acc.bank}
                  {acc.branch && ` · ${acc.branch}`}
                </div>
              )}
              <div className="mt-0.5 text-[12px] text-gray-500">
                戶名:{acc.holder || "—"} · 帳號:{acc.accountNo}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface InvoicePreviewProps {
  campaign: FbCampaign;
  date: DateConfig;
  markup: number;
  account: PaymentAccount;
}

const InvoicePreview = forwardRef<HTMLDivElement, InvoicePreviewProps>(function InvoicePreviewInner(
  { campaign, date, markup, account },
  ref,
) {
  const ins = getIns(campaign);
  const spend = spendOf(campaign);
  const msgs = getMsgCount(campaign);
  const plus = spendPlus(spend, markup);
  const today = new Date();
  const issueDate = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}`;
  const dateRangeLabel = concreteRangeLabel(date);

  return (
    <div
      ref={ref}
      // Fixed width so the rasterised JPG has a consistent pixel size
      // regardless of the modal's responsive width.
      className="mx-auto bg-white p-8 text-ink"
      style={{ width: 640, fontFamily: "'Noto Sans TC', sans-serif" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between border-b-2 border-orange pb-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[1px] text-orange">
            LURE META PLATFORM
          </div>
          <div className="mt-1 text-[24px] font-bold leading-tight">
            廣告投放總覽 {dateRangeLabel}
          </div>
        </div>
        <div className="text-right text-[11px] text-gray-500">
          <div>開立日期:{issueDate}</div>
          <div>結算期間:{dateRangeLabel}</div>
        </div>
      </div>

      {/* Basic data table */}
      <div className="mt-5">
        <SectionTitle>數據總覽</SectionTitle>
        <table className="mt-2 w-full border-collapse text-[12px]">
          <thead>
            <tr className="bg-orange-bg">
              <th className="border border-border px-2.5 py-1.5 text-left font-semibold">項目</th>
              <th className="border border-border px-2.5 py-1.5 text-right font-semibold">數值</th>
            </tr>
          </thead>
          <tbody>
            <DataRow label="廣告花費" value={`$${fM(spend)}`} />
            <DataRow label="曝光次數" value={fN(ins.impressions)} />
            <DataRow label="點擊次數" value={fN(ins.clicks)} />
            <DataRow label="點擊率 CTR" value={fP(ins.ctr)} />
            <DataRow label="單次點擊成本 CPC" value={`$${fM(ins.cpc)}`} />
            <DataRow label="千次曝光成本 CPM" value={`$${fM(ins.cpm)}`} />
            {msgs > 0 && (
              <>
                <DataRow label="私訊次數" value={fN(msgs)} />
                <DataRow label="單次私訊成本" value={`$${fM(spend / msgs)}`} />
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Cost summary */}
      <div className="mt-5">
        <SectionTitle>請款金額</SectionTitle>
        <table className="mt-2 w-full border-collapse text-[12px]">
          <tbody>
            <tr>
              <td className="border border-border bg-bg px-2.5 py-2 font-semibold">廣告費用</td>
              <td className="border border-border px-2.5 py-2 text-right tabular-nums">
                ${fM(spend)}
              </td>
            </tr>
            <tr>
              <td className="border border-border bg-bg px-2.5 py-2 font-semibold">
                服務費(+{markup}%)
              </td>
              <td className="border border-border px-2.5 py-2 text-right tabular-nums">
                ${fM(plus - spend)}
              </td>
            </tr>
            <tr>
              <td className="border-2 border-orange bg-orange-bg px-2.5 py-2.5 text-[13px] font-bold text-orange">
                應付總額
              </td>
              <td className="border-2 border-orange bg-orange-bg px-2.5 py-2.5 text-right text-[15px] font-bold tabular-nums text-orange">
                ${fM(plus)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Payment info */}
      <div className="mt-5">
        <SectionTitle>付款資訊</SectionTitle>
        <table className="mt-2 w-full border-collapse text-[12px]">
          <tbody>
            <PayRow label="銀行" value={account.bank || "—"} />
            <PayRow label="分行" value={account.branch || "—"} />
            <PayRow label="戶名" value={account.holder || "—"} />
            <PayRow label="帳號" value={account.accountNo || "—"} mono />
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <div className="mt-6 border-t border-border pt-3 text-center text-[10px] text-gray-300">
        Powered by LURE META PLATFORM
      </div>
    </div>
  );
});

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] font-bold tracking-[0.5px] text-orange">{children}</div>;
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="border border-border px-2.5 py-1.5">{label}</td>
      <td className="border border-border px-2.5 py-1.5 text-right tabular-nums">{value}</td>
    </tr>
  );
}

function PayRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <tr>
      <td className="border border-border bg-bg px-2.5 py-1.5 font-semibold w-[88px]">{label}</td>
      <td
        className={`border border-border px-2.5 py-1.5 ${mono ? "tabular-nums tracking-wider" : ""}`}
      >
        {value}
      </td>
    </tr>
  );
}

/** "M/D - M/D" 格式;start === end 時只顯示一個日期。 */
function concreteRangeLabel(date: DateConfig): string {
  const { start, end } = resolveRange(date);
  const parse = (iso: string) => {
    const parts = iso.split("-");
    return {
      m: Number.parseInt(parts[1] ?? "0", 10),
      d: Number.parseInt(parts[2] ?? "0", 10),
    };
  };
  const s = parse(start);
  const e = parse(end);
  if (start === end) return `${s.m}/${s.d}`;
  return `${s.m}/${s.d} - ${e.m}/${e.d}`;
}
