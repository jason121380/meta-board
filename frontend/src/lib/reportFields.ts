/**
 * 共用的 LINE flex 推播報告欄位常數 + 工具。給
 * `views/settings/GroupPushConfigModal.tsx` (LINE 推播設定 → 群組推播) 使用。
 *
 * code 必須跟 backend `_build_flex_for_config` 內的 `field_catalog`
 * 鍵值一致,否則新增/移除欄位時會兩邊不同步。
 */

export interface ReportFieldDef {
  code: string;
  label: string;
}

export const REPORT_FIELDS: ReportFieldDef[] = [
  { code: "spend", label: "花費" },
  { code: "spend_plus", label: "花費+%" },
  { code: "impressions", label: "曝光" },
  { code: "clicks", label: "點擊" },
  { code: "ctr", label: "CTR" },
  { code: "cpc", label: "CPC" },
  { code: "cpm", label: "CPM" },
  { code: "frequency", label: "頻次" },
  { code: "reach", label: "觸及" },
  { code: "msgs", label: "私訊數" },
  { code: "msg_cost", label: "私訊成本" },
];

/** 互斥群組 — 同一陣列內的 code 在 multi-select 內只能擇一。
 *  目前僅有「花費 / 花費+%」需要互斥(同一份報告不會同時放原始花費
 *  跟加成後的花費)。 */
export const MUTEX_GROUPS: string[][] = [["spend", "spend_plus"]];

/** 預設選擇 — 與 backend 內建預設一致 (spend 而非 spend_plus,
 *  因為對內監控通常想看真實花費)。 */
export const DEFAULT_REPORT_FIELDS = [
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "msgs",
  "msg_cost",
];

/** 計算「全選」時的 code 陣列 — 互斥群組各只取第一個 code 避免
 *  spend / spend_plus 被同時勾起。 */
export function selectAllReportFields(): string[] {
  const blocked = new Set<string>();
  for (const group of MUTEX_GROUPS) {
    for (const code of group.slice(1)) blocked.add(code);
  }
  return REPORT_FIELDS.filter((f) => !blocked.has(f.code)).map((f) => f.code);
}

/** Toggle 一個 code 的勾選狀態,並依 mutex 規則自動清掉同群組的
 *  其他 code。回傳依 catalog 順序排好的新 code 陣列。 */
export function toggleReportField(current: string[], code: string): string[] {
  const set = new Set(current);
  if (set.has(code)) {
    set.delete(code);
  } else {
    for (const group of MUTEX_GROUPS) {
      if (group.includes(code)) {
        for (const sibling of group) {
          if (sibling !== code) set.delete(sibling);
        }
      }
    }
    set.add(code);
  }
  return REPORT_FIELDS.filter((f) => set.has(f.code)).map((f) => f.code);
}

/** 從 server config 的 report_fields 解析:空陣列 → fallback 到預設。 */
export function normalizeReportFields(input: string[] | null | undefined): string[] {
  if (input?.length) return input;
  return [...DEFAULT_REPORT_FIELDS];
}
