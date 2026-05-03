import { Fragment } from "react";

type Context = "checkout" | "portal";

const CHECKOUT_GLOSSARY: Array<[string, string]> = [
  ["Subscribe / Pay", "訂閱 / 付款"],
  ["Email", "電子信箱"],
  ["Card number", "信用卡卡號"],
  ["MM / YY · Expiration", "有效期限(月/年)"],
  ["CVC", "卡片背面 3 碼安全碼"],
  ["Cardholder name", "持卡人姓名(英文)"],
  ["Country / Region", "國家(選 Taiwan)"],
  ["Billing address", "帳單地址"],
  ["Tax ID / VAT", "統一編號(個人可留白)"],
  ["Free trial", "免費試用"],
  ["Subtotal / Total", "小計 / 總計"],
  ["Coupon code", "優惠碼(若有)"],
];

const PORTAL_GLOSSARY: Array<[string, string]> = [
  ["Subscriptions", "我的訂閱"],
  ["Active", "進行中"],
  ["Trialing", "試用中"],
  ["Past due", "扣款失敗"],
  ["Canceled", "已取消"],
  ["Change plan / Upgrade / Downgrade", "變更方案 / 升級 / 降級"],
  ["Cancel subscription", "取消訂閱"],
  ["Resume subscription", "恢復訂閱"],
  ["Update payment method", "更新付款方式"],
  ["Billing history / Invoices", "帳單記錄 / 發票"],
  ["Download invoice", "下載發票 PDF"],
  ["Next billing date", "下次扣款日"],
];

export function PolarLanguageNotice({ context }: { context: Context }) {
  const glossary = context === "checkout" ? CHECKOUT_GLOSSARY : PORTAL_GLOSSARY;
  const intro =
    context === "checkout"
      ? "點擊後會跳轉到 Polar 付款頁(英文介面),以下為主要欄位對照"
      : "點擊後會跳轉到 Polar 自助管理頁(英文介面),以下為主要操作對照";
  return (
    <details className="group rounded-xl border border-border bg-orange-bg/60 px-3.5 py-2.5 text-[12px] md:text-[13px]">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-orange">
        <InfoIcon />
        <span className="flex-1">{intro}</span>
        <span className="text-gray-300 transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="mt-3 flex flex-col gap-1.5 border-t border-orange/20 pt-3">
        {glossary.map(([en, zh]) => (
          <Fragment key={en}>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <span className="font-semibold text-ink">{en}</span>
              <span className="text-gray-500">{zh}</span>
            </div>
          </Fragment>
        ))}
      </div>
    </details>
  );
}

function InfoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}
