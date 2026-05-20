import type { ProfileShowcase } from "../../../lib/types/profile";

export function CustomTextShowcase({ showcase }: { showcase: ProfileShowcase }) {
  const text =
    typeof showcase.config.text === "string"
      ? showcase.config.text
      : "Custom showcase text has not been set.";

  return (
    <div className="border border-white/10 bg-white/[0.05] p-5">
      <h3 className="text-lg font-bold text-white">{showcase.title ?? "Custom"}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-300">{text}</p>
    </div>
  );
}
