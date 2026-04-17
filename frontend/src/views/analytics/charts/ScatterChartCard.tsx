import type { ChartData, ChartOptions } from "chart.js";
import { useMemo } from "react";
import { Scatter } from "react-chartjs-2";
import "../chartSetup";
import type { ScatterPoint } from "../analyticsData";

/**
 * Scatter chart with mode switch: when any campaign has message data
 * the chart plots spend (x) vs msg cost (y); otherwise it plots
 * CTR (x) vs spend (y). Port of the original design lines 2635–2651.
 */

export interface ScatterChartCardProps {
  points: ScatterPoint[];
  isMsgCost: boolean;
  formatMoney: (v: number) => string;
}

interface ScatterRaw extends ScatterPoint {}

export function ScatterChartCard({ points, isMsgCost, formatMoney }: ScatterChartCardProps) {
  const chartData: ChartData<"scatter"> = useMemo(
    () => ({
      datasets: [
        {
          // biome-ignore lint/suspicious/noExplicitAny: Chart.js raw typing quirk
          data: points as any,
          backgroundColor: "#FF6B2C99",
          pointRadius: 5,
          pointHoverRadius: 7,
        },
      ],
    }),
    [points],
  );

  const options: ChartOptions<"scatter"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const raw = ctx.raw as ScatterRaw | undefined;
              if (!raw) return "";
              const camp = raw.campaignName.slice(0, 18);
              const metric = isMsgCost ? `成本:$${formatMoney(raw.y)}` : `CTR:${raw.x.toFixed(2)}%`;
              const spend = `花費:$${formatMoney(isMsgCost ? raw.x : raw.y)}`;
              return `${raw.accountName} | ${camp} | ${metric} ${spend}`;
            },
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: isMsgCost ? "花費 TWD" : "CTR (%)" },
          grid: { color: "#F5F5F5" },
          ticks: {
            callback: (v) => (isMsgCost ? `$${formatMoney(Number(v))}` : `${v}%`),
          },
        },
        y: {
          title: { display: true, text: isMsgCost ? "私訊成本" : "花費 TWD" },
          grid: { color: "#F5F5F5" },
          ticks: { callback: (v) => `$${formatMoney(Number(v))}` },
        },
      },
    }),
    [isMsgCost, formatMoney],
  );

  return <Scatter data={chartData} options={options} />;
}
