import { cn } from "@/lib/cn";
import { type VariantProps, cva } from "class-variance-authority";
import { type ButtonHTMLAttributes, forwardRef } from "react";

/**
 * Button — ported from the `.btn` / `.btn-blue` / `.btn-ghost` /
 * `.btn-red` / `.btn-sm` classes in dashboard.html. Uses CVA so variants
 * compose cleanly and shadcn-style.
 *
 * Visual contract: these must match legacy dashboard buttons exactly
 * (height 36px default / 30px sm, pill radius, orange CTA).
 */
const buttonVariants = cva(
  [
    "inline-flex items-center gap-1.5 font-semibold font-sans",
    "rounded-pill border-[1.5px] transition-[all] duration-150",
    "cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40",
  ],
  {
    variants: {
      variant: {
        primary: [
          "bg-orange text-white border-orange",
          "hover:bg-orange-dark hover:border-orange-dark",
        ],
        ghost: [
          "bg-transparent text-ink border-border",
          "hover:bg-orange-bg hover:text-orange hover:border-orange-border",
        ],
        danger: ["bg-red-bg text-red border-transparent", "hover:bg-[#FFCDD2]"],
      },
      size: {
        md: "h-9 px-[18px] text-[13px]",
        sm: "h-[30px] px-3.5 text-xs",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "md",
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);

Button.displayName = "Button";
