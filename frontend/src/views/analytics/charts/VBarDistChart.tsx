import type { ChartData, ChartOptions } from "chart.js";
import { useMemo } from "react";
import { Bar } from "react-chartjs-2";
import "../chartSetup";

/**
 * Vertical bar distribution chart. Used by 4 charts:
 *   - CTR distribution
 *   - CPC distribution
 *   - Spend distribution
 *   - Message cost distribution
 *
 * All share the same shape: fixed buckets, bold datalabels on top,
 * multicolor bars (ordered roughly from "good" to "bad"), integer
 * y-axis. Empty buckets render no label (formatter returns "").
 */

export interface VBarDistChartProps {
  labels: string[];
  values: number[];
  colors: string[];
}

export function VBarDistChart({ labels, values, colors }: VBarDistChartProps) {
  const chartData: ChartData<"bar"> = useMemo(
    () => ({
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderRadius: 6,
          // biome-ignore lint/suspicious/noExplicitAny: chart.js typing quirk
          borderSkipped: false as any,
        },
      ],
    }),
    [labels, values, colors],
  );

  const options: ChartOptions<"bar"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: {
          display: true,
          anchor: "end",
          align: "top",
          formatter: (v) => ((v as number) > 0 ? String(v) : ""),
          font: { size: 10, weight: "bold" },
          color: "#555",
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          grid: { color: "#F5F5F5" },
          ticks: { precision: 0 },
        },
      },
      layout: { padding: { top: 16 } },
    }),
    [],
  );

  return <Bar data={chartData} options={options} />;
}
