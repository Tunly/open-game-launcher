import type { ButtonHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-sky-400 text-slate-950 hover:bg-sky-300 active:bg-sky-500 shadow-sm shadow-sky-950/40",
  secondary:
    "border border-white/10 bg-white/[0.06] text-slate-100 hover:border-white/20 hover:bg-white/[0.1]",
  ghost: "text-slate-300 hover:bg-white/[0.07] hover:text-white",
  danger:
    "border border-rose-400/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      type={type}
      {...props}
    />
  );
}
