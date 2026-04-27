import { cn } from "@/lib/cn";
import {
  DEFAULT_REPORT_FIELDS,
  REPORT_FIELDS,
  selectAllReportFields,
  toggleReportField,
} from "@/lib/reportFields";

/**
 * Multi-select chip picker for the LINE flex push report fields.
 * Used by both `LinePushModal` (dashboard) and `GroupPushConfigModal`
 * (LINE 推播設定 group page) so the two surfaces stay in sync.
 *
 * Behavior:
 *   - Tap a chip → toggle. Mutex groups (spend / spend_plus) auto-
 *     deselect siblings.
 *   - 「全選」 picks every field, but only the first of each mutex
 *     group (so spend gets selected, spend_plus stays unchecked).
 *   - 「還原預設」 restores the default subset.
 *   - Empty selection → red warning underneath.
 */
export interface ReportFieldsPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
}

export function ReportFieldsPicker({ value, onChange }: ReportFieldsPickerProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-ink">報告欄位</span>
        <div className="flex items-center gap-2 text-[11px] text-gray-300">
          <button
            type="button"
            onClick={() => onChange(selectAllReportFields())}
            className="hover:text-orange"
          >
            全選
          </button>
          <span className="text-gray-300/60">|</span>
          <button
            type="button"
            onClick={() => onChange([...DEFAULT_REPORT_FIELDS])}
            className="hover:text-orange"
          >
            還原預設
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {REPORT_FIELDS.map((field) => {
          const selected = value.includes(field.code);
          return (
            <button
              key={field.code}
              type="button"
              onClick={() => onChange(toggleReportField(value, field.code))}
              className={cn(
                "h-7 rounded-full border px-2.5 text-[11px] font-semibold transition",
                selected
                  ? "border-orange bg-orange-bg text-orange"
                  : "border-border bg-white text-gray-500 hover:border-orange",
              )}
              aria-pressed={selected}
            >
              {field.label}
            </button>
          );
        })}
      </div>
      {value.length === 0 && (
        <span className="text-[10px] text-red">至少選一個欄位,否則報告會是空的</span>
      )}
    </div>
  );
}
