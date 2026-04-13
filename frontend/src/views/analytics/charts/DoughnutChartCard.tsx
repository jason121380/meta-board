import type { ChartData, ChartOptions } from "chart.js";
import { useMemo } from "react";
import { Doughnut } from "react-chartjs-2";
import "../chartSetup";

/**
 * Doughnut chart wrapper — used by 2 charts:
 *   - 有/無私訊活動比例 (legend bottom, simple 2-slice)
 *   - 私訊數佔比 (legend right, top 8 by msg)
 *
 * Tooltip callback is optional; default formats as "label: value".
 */

export interface DoughnutChartCardProps {
  labels: string[];
  data: number[];
  colors: string[];
  legendPosition: "bottom" | "right";
  cutout: string;
  formatTooltip?: (label: string, value: number) => string;
}

export function DoughnutChartCard({
  labels,
  data,
  colors,
  legendPosition,
  cutout,
  formatTooltip,
}: DoughnutChartCardProps) {
  const chartData: ChartData<"doughnut"> = useMemo(
    () => ({
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderWidth: 0,
        },
      ],
    }),
    [labels, data, colors],
  );

  const options: ChartOptions<"doughnut"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout,
      plugins: {
        datalabels: { display: false },
        legend: {
          position: legendPosition,
          labels:
            legendPosition === "right"
              ? { font: { size: 10 }, boxWidth: 12 }
              : { font: { size: 12 } },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const label = ctx.label ?? "";
              const raw = Number(ctx.raw) || 0;
              return formatTooltip ? formatTooltip(label, raw) : `${label}: ${raw}`;
            },
          },
        },
      },
    }),
    [legendPosition, cutout, formatTooltip],
  );

  return <Doughnut data={chartData} options={options} />;
}
