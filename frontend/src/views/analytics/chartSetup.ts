import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  DoughnutController,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  ScatterController,
  Title,
  Tooltip,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";

/**
 * Register Chart.js controllers / elements / scales / plugins ONCE,
 * at module load. react-chartjs-2 is tree-shakeable, so we must
 * explicitly register each piece we use.
 *
 * The legacy the original design imports Chart.js via CDN (non-tree-
 * shakeable UMD build), which registers everything automatically. In
 * the React build we pin the same version (chart.js@4.4.0) so the
 * drawn canvas pixels are byte-identical, but we have to enumerate
 * the registrations manually.
 *
 * ChartDataLabels is registered GLOBALLY here so every bar chart
 * that uses inline value labels doesn't need `plugins: [ChartDataLabels]`.
 */

ChartJS.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  DoughnutController,
  ArcElement,
  ScatterController,
  PointElement,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  ChartDataLabels,
);

/**
 * Disable datalabels by default on every chart so charts that don't
 * opt-in (doughnut, scatter, KPI charts) don't get surprise labels.
 * Individual charts re-enable by passing `datalabels: {display: true, ...}`
 * in their options.
 */
ChartJS.defaults.plugins = ChartJS.defaults.plugins ?? {};
// biome-ignore lint/suspicious/noExplicitAny: chart.js default typing is tight
(ChartJS.defaults.plugins as any).datalabels = { display: false };

export { ChartJS };
