import { cn } from "../../lib/utils";

interface ProgressBarProps {
  value: number;
  className?: string;
}

export function ProgressBar({ value, className }: ProgressBarProps) {
  const progress = Math.min(100, Math.max(0, value));

  return (
    <div
      className={cn(
        "h-2 overflow-hidden rounded-full bg-white/[0.08]",
        className,
      )}
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-sky-400 transition-all duration-300"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
