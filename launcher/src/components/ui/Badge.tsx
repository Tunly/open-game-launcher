import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

export type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "muted"
  | "danger"
  | "info";

interface BadgeProps {
  children: ReactNode;
  className?: string;
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "border-white/10 bg-white/[0.06] text-slate-200",
  success: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  warning: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  muted: "border-slate-400/15 bg-slate-400/10 text-slate-300",
  danger: "border-rose-400/30 bg-rose-500/10 text-rose-100",
  info: "border-sky-300/25 bg-sky-400/10 text-sky-100",
};

export function Badge({
  children,
  className,
  variant = "default",
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-semibold",
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
