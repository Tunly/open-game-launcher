import type { ProfileShowcase } from "../../../lib/types/profile";
import { ShowcasePanel } from "./ShowcasePanel";

export function CustomTextShowcase({ showcase }: { showcase: ProfileShowcase }) {
  const text =
    typeof showcase.config.text === "string"
      ? showcase.config.text
      : "Custom showcase text has not been set.";

  return (
    <ShowcasePanel title={showcase.title ?? "Custom"}>
      <p className="text-sm font-semibold leading-6 text-[#5b403f]">{text}</p>
    </ShowcasePanel>
  );
}
