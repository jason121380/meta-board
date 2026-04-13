import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Class name utility — `clsx` + `tailwind-merge`. Standard shadcn idiom.
 * Use everywhere instead of string concatenation so conflicting Tailwind
 * utilities (e.g. `p-2` + `p-4`) are merged correctly.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
