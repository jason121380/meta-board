import { cn } from "@/lib/cn";
import { type InputHTMLAttributes, forwardRef } from "react";

/**
 * Toggle switch — 32×18 px, orange when checked. Uses the global
 * `.toggle` / `.slider` class pair from dashboard.html that's defined in
 * globals.css so visual behavior is identical to the legacy build.
 *
 * Mandated flow per CLAUDE.md: any status change must be preceded by a
 * `confirm()` dialog. The Toggle itself doesn't enforce this — callers
 * use the <ConfirmDialog> primitive (Phase 1 later).
 */

export type ToggleProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  className?: string;
};

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(({ className, ...props }, ref) => (
  <label className={cn("toggle", className)}>
    <input ref={ref} type="checkbox" {...props} />
    <span className="slider" />
  </label>
));

Toggle.displayName = "Toggle";
