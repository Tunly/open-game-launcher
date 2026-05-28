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
    "bg-[#c20b2f] text-[#fbf4e7] border-2 border-[#171411] hover:bg-[#e92846] active:bg-[#a60724] shadow-[3px_3px_0_#171411]",
  secondary:
    "bg-[#fbf4e7] text-[#171411] border-2 border-[#171411] hover:bg-[#f5eedf] active:bg-[#eee4d2] shadow-[3px_3px_0_#171411]",
  ghost: "text-[#171411] hover:bg-[#eee4d2] active:bg-[#d9d7d0]",
  danger:
    "bg-[#d93728] text-[#fbf4e7] border-2 border-[#171411] hover:bg-[#e92846] active:bg-[#a60724] shadow-[3px_3px_0_#171411]",
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
        "inline-flex items-center justify-center gap-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      type={type}
      {...props}
    />
  );
}
