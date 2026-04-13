import { cn } from "@/lib/cn";
import { type InputHTMLAttributes, forwardRef } from "react";

/**
 * Custom checkbox — white checkmark on orange background.
 * Uses the global `.custom-cb` class from globals.css so that any
 * `<input type="checkbox" className="custom-cb">` produced by either the
 * new React code OR any legacy HTML we're still porting renders
 * identically.
 *
 * Do NOT use `accent-color` inline style — always use this class.
 */
export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => (
    <input ref={ref} type="checkbox" className={cn("custom-cb", className)} {...props} />
  ),
);

Checkbox.displayName = "Checkbox";
