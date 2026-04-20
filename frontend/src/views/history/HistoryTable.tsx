import type { NicknameMap } from "@/api/hooks/useNicknames";
import { FbCampaignLink } from "@/components/FbCampaignLink";
import { NicknameEditModal } from "@/components/NicknameEditModal";
import { fM } from "@/lib/format";
import { formatNickname } from "@/views/finance/financeData";
import { useMemo, useState } from "react";
import type { HistoryRow, MonthCol } from "./historyData";
import { monthTotals } from "./historyData";

/**
 * Campaign × month spend matrix. Campaigns are rows, months are
 * columns (newest → oldest). Each cell shows the $ spend for that
 * campaign in that month. A trailing 合計 column sums a row across
 * all displayed months.
 *
 * Filtering:
 *  - `search` trims + case-insensitive substring match against both
 *    the campaign name and the nickname (so users can find rows by
 *    either).
 *  - `hideZero` drops rows whose 6-month total is 0 (no spend in the
 *    whole visible window). Matches the 有花費 semantics from Finance.
 *  - `showNicknames` replaces the campaign name with its "店家 · 設計師"
 *    label when one exists, falling back to the raw name.
 */
export function HistoryTable({
  months,
  rows,
  search,
  hideZero,
  showNicknames,
  nicknames,
  accountId,
  businessId,
}: {
  months: MonthCol[];
  rows: HistoryRow[];
  search: string;
  hideZero: boolean;
  showNicknames: boolean;
  nicknames: NicknameMap;
  accountId: string | null;
  businessId: string | undefined;
}) {
  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    store: string;
    designer: string;
  } | null>(null);
  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (hideZero && r.total <= 0) return false;
      if (term) {
        const nick = formatNickname(nicknames[r.campaignId]) ?? "";
        const hay = `${r.campaignName} ${nick}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, search, hideZero, nicknames]);

  const totals = monthTotals(visibleRows, months);
  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);

  if (visibleRows.length === 0) {
    return <div className="p-[60px] text-center text-gray-300">無符合條件的行銷活動</div>;
  }

  return (
    <>
      {editing && (
        <NicknameEditModal
          open={true}
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
          campaignId={editing.id}
          campaignName={editing.name}
          initialStore={editing.store}
          initialDesigner={editing.designer}
        />
      )}
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr className="border-b border-border bg-white">
          <th className="sticky left-0 z-10 bg-white px-3 py-2.5 text-left text-[12px] font-semibold text-ink">
            行銷活動
          </th>
          {months.map((m) => (
            <th
              key={m.key}
              className="whitespace-nowrap px-3 py-2.5 text-right text-[12px] font-semibold text-ink"
            >
              <div>{m.label}</div>
              {m.hint && <div className="text-[10px] font-normal text-gray-300">{m.hint}</div>}
            </th>
          ))}
          <th className="whitespace-nowrap px-3 py-2.5 text-right text-[12px] font-semibold text-orange">
            合計
          </th>
        </tr>
      </thead>
      <tbody>
        {visibleRows.map((row) => {
          const nickLabel = formatNickname(nicknames[row.campaignId]);
          const display = showNicknames && nickLabel ? nickLabel : row.campaignName;
          return (
          <tr
            key={row.campaignId}
            className="border-b border-border bg-white hover:bg-orange-bg"
          >
            <td
              className="sticky left-0 z-[5] bg-inherit px-3 py-2 text-[13px] font-medium text-ink"
              title={row.campaignName}
            >
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 max-w-[240px] flex-1 truncate">{display}</span>
                <button
                  type="button"
                  title="編輯暱稱"
                  aria-label={`編輯暱稱 ${row.campaignName}`}
                  onClick={() =>
                    setEditing({
                      id: row.campaignId,
                      name: row.campaignName,
                      store: nicknames[row.campaignId]?.store ?? "",
                      designer: nicknames[row.campaignId]?.designer ?? "",
                    })
                  }
                  className="shrink-0 cursor-pointer text-gray-300 hover:text-orange"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                  </svg>
                </button>
                <FbCampaignLink
                  campaignId={row.campaignId}
                  accountId={accountId ?? undefined}
                  campaignName={row.campaignName}
                  businessId={businessId}
                />
              </div>
            </td>
            {months.map((m) => {
              const v = row.spendByMonth[m.key] ?? 0;
              return (
                <td
                  key={m.key}
                  className="whitespace-nowrap px-3 py-2 text-right tabular-nums"
                >
                  {v > 0 ? `$${fM(v)}` : <span className="text-gray-300">—</span>}
                </td>
              );
            })}
            <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-orange">
              ${fM(row.total)}
            </td>
          </tr>
          );
        })}
      </tbody>
      {visibleRows.length > 0 && (
        <tfoot>
          <tr className="border-t-2 border-border bg-bg">
            <td className="sticky left-0 z-[5] bg-bg px-3 py-2.5 text-[12px] font-semibold text-ink">
              合計
            </td>
            {months.map((m) => (
              <td
                key={m.key}
                className="whitespace-nowrap px-3 py-2.5 text-right text-[12px] font-semibold tabular-nums text-ink"
              >
                ${fM(totals[m.key] ?? 0)}
              </td>
            ))}
            <td className="whitespace-nowrap px-3 py-2.5 text-right text-[12px] font-semibold tabular-nums text-orange">
              ${fM(grandTotal)}
            </td>
          </tr>
        </tfoot>
      )}
    </table>
    </>
  );
}
