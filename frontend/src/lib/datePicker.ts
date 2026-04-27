/**
 * Date picker core logic — pure functions extracted from the legacy
 * `DatePicker` class in the original design (lines 1306–1533). Kept as pure
 * functions so the component stays simple and the logic is unit-testable
 * without rendering anything.
 *
 * Presets are the exact 7 FB-compatible presets used across all 4 date
 * pickers in the legacy build (dashboard / analytics / alerts / finance).
 */

export type DatePreset =
  | "today"
  | "yesterday"
  | "last_7d"
  | "last_30d"
  | "last_90d"
  | "this_month"
  | "last_month"
  | "custom";

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string;
}

export interface DateConfig {
  preset: DatePreset;
  /** Only set when preset === "custom". */
  from: string | null;
  /** Only set when preset === "custom". */
  to: string | null;
}

export const DP_PRESETS: Array<{ value: Exclude<DatePreset, "custom">; label: string }> = [
  { value: "today", label: "今天" },
  { value: "yesterday", label: "昨天" },
  { value: "last_7d", label: "近 7 天" },
  { value: "last_30d", label: "近 30 天" },
  { value: "last_90d", label: "近 90 天" },
  { value: "this_month", label: "本月" },
  { value: "last_month", label: "上個月" },
];

/** Format a Date as YYYY-MM-DD (local time, not UTC). */
export function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Compute the start/end dates for a given config. For a custom preset
 * we return the user-picked range; otherwise we compute relative to the
 * current local date (matching the legacy behavior exactly).
 */
export function resolveRange(config: DateConfig, now = new Date()): DateRange {
  if (config.preset === "custom" && config.from && config.to) {
    return { start: config.from, end: config.to };
  }
  const today = new Date(now);
  switch (config.preset) {
    case "today":
      return { start: fmtDate(today), end: fmtDate(today) };
    case "yesterday": {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      return { start: fmtDate(d), end: fmtDate(d) };
    }
    case "last_7d": {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      return { start: fmtDate(d), end: fmtDate(today) };
    }
    case "last_30d": {
      const d = new Date(today);
      d.setDate(d.getDate() - 29);
      return { start: fmtDate(d), end: fmtDate(today) };
    }
    case "last_90d": {
      const d = new Date(today);
      d.setDate(d.getDate() - 89);
      return { start: fmtDate(d), end: fmtDate(today) };
    }
    case "this_month": {
      const s = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: fmtDate(s), end: fmtDate(today) };
    }
    case "last_month": {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: fmtDate(s), end: fmtDate(e) };
    }
    default:
      return { start: fmtDate(today), end: fmtDate(today) };
  }
}

/**
 * Build the FB API query-string fragment for a config. The legacy
 * backend expects either `date_preset=...` or `time_range={json}`.
 */
export function toApiParams(config: DateConfig): string {
  if (config.preset === "custom" && config.from && config.to) {
    return `time_range={"since":"${config.from}","until":"${config.to}"}`;
  }
  return `date_preset=${config.preset}`;
}

/** Human-readable label for a config (used by the trigger button). */
export function toLabel(config: DateConfig): string {
  if (config.preset === "custom" && config.from && config.to) {
    return `${config.from} ~ ${config.to}`;
  }
  const preset = DP_PRESETS.find((p) => p.value === config.preset);
  return preset ? preset.label : "選擇日期";
}

/** 緊湊版 label — DatePicker 觸發按鈕用。Custom range 從完整 ISO
 *  (`2026-04-01 ~ 2026-04-26`) 縮成 `M/D ~ M/D` (`4/1 ~ 4/26`),
 *  避免在手機 Topbar 把帳戶選擇器跟頁面標題擠到出畫面外。Preset
 *  則直接沿用中文 label (本月 / 過去 7 天等),已經夠短。 */
export function toShortLabel(config: DateConfig): string {
  if (config.preset === "custom" && config.from && config.to) {
    const parse = (iso: string) => {
      const parts = iso.split("-");
      return `${Number.parseInt(parts[1] ?? "0", 10)}/${Number.parseInt(parts[2] ?? "0", 10)}`;
    };
    return `${parse(config.from)} ~ ${parse(config.to)}`;
  }
  const preset = DP_PRESETS.find((p) => p.value === config.preset);
  return preset ? preset.label : "選擇日期";
}
