import { fM } from "@/lib/format";
import type { HistoryRow, MonthCol } from "./historyData";
import { monthTotals } from "./historyData";

/**
 * Campaign × month spend matrix. Campaigns are rows, months are
 * columns (newest → oldest). Each cell shows the $ spend for that
 * campaign in that month. A trailing 合計 column sums a row across
 * all displayed months.
 */
export function HistoryTable({
  months,
  rows,
}: {
  months: MonthCol[];
  rows: HistoryRow[];
}) {
  const totals = monthTotals(rows, months);
  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);

  return (
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
        {rows.map((row) => (
          <tr
            key={row.campaignId}
            className="border-b border-border bg-white hover:bg-orange-bg"
          >
            <td
              className="sticky left-0 z-[5] max-w-[240px] truncate bg-inherit px-3 py-2 text-[13px] font-medium text-ink"
              title={row.campaignName}
            >
              {row.campaignName}
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
        ))}
      </tbody>
      {rows.length > 0 && (
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
  );
}
