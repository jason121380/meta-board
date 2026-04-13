import type { ChartData, ChartOptions } from "chart.js";
import { useMemo } from "react";
import { Bar } from "react-chartjs-2";
import "../chartSetup";

/**
 * Horizontal bar chart with right-aligned datalabels.
 *
 * Ported from dashboard.html bar-chart pattern used by 7 different
 * charts (spend by account, msg by account, top msg, best CPM,
 * account msg cost, account CTR, msg ROI). All share the same shape:
 *   - indexAxis: "y"
 *   - legend hidden
 *   - rounded bars
 *   - datalabels at the right edge, formatted via a caller-provided
 *     `formatLabel` function
 *   - x-axis ticks formatted via `formatTick`
 *   - padding.right: 60 to leave room for the labels
 */

export interface HBarChartProps {
  labels: string[];
  data: number[];
  color: string | string[];
  formatLabel: (value: number) => string;
  formatTick: (value: number) => string;
  /** Right padding in px (default 55) — override to fit long labels. */
  padRight?: number;
}

export function HBarChart({
  labels,
  data,
  color,
  formatLabel,
  formatTick,
  padRight = 55,
}: HBarChartProps) {
  const chartData: ChartData<"bar"> = useMemo(
    () => ({
      labels,
      datasets: [
        {
          data,
          backgroundColor: color,
          borderRadius: 6,
          // biome-ignore lint/suspicious/noExplicitAny: chart.js typing quirk
          borderSkipped: false as any,
        },
      ],
    }),
    [labels, data, color],
  );

  const options: ChartOptions<"bar"> = useMemo(
    () => ({
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: {
          display: true,
          anchor: "end",
          align: "right",
          formatter: (v) => formatLabel(v as number),
          font: { size: 10 },
          color: "#555",
        },
      },
      scales: {
        x: {
          grid: { color: "#F5F5F5" },
          ticks: { callback: (v) => formatTick(Number(v)) },
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 10 } },
        },
      },
      layout: { padding: { right: padRight } },
    }),
    [formatLabel, formatTick, padRight],
  );

  return <Bar data={chartData} options={options} />;
}
