import type { ReactNode } from "react";

/**
 * Chart card wrapper — 16px radius, 1px border, padding 20/20/16,
 * with a 13px bold title at the top. Used for every analytics chart
 * card (uses the legacy `.ai-chart-card` + `.ai-chart-title` CSS
 * classes from globals.css).
 *
 * The canvas needs a fixed height since Chart.js v4 respects the
 * container height when maintainAspectRatio is false. 220px matches
 * the legacy `<canvas height="220">` attribute.
 */

export interface ChartCardProps {
  title: string;
  /** Empty-state message shown instead of the chart. */
  emptyMessage?: string | null;
  children: ReactNode;
  height?: number;
}

export function ChartCard({ title, emptyMessage, children, height = 220 }: ChartCardProps) {
  return (
    <div className="ai-chart-card">
      <div className="ai-chart-title">{title}</div>
      {emptyMessage ? (
        <div className="ai-empty-chart">{emptyMessage}</div>
      ) : (
        <div style={{ position: "relative", height }}>{children}</div>
      )}
    </div>
  );
}
