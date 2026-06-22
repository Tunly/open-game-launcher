import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyOverlayFullscreenAntiCheatReadiness } from "../../lib/overlay-fullscreen-anti-cheat-readiness";
import { OverlayFullscreenAntiCheatReadinessPanel } from "./OverlayFullscreenAntiCheatReadinessPanel";

const falseOverlayFullscreenClaim =
  /\b(?:fullscreen\s*injection\s*(?:ready|verified|enabled|executed|complete|passed|active)|anti-cheat\s*bypass\s*(?:ready|verified|enabled|passed|complete|active)|kernel\/?driver\s*install\s*(?:ready|verified|executed|complete|passed)|kernel\s*driver\s*(?:installed|loaded|ready|verified)|protected-?process\s*(?:attach|attached|access|read|write|hook|inject)\s*(?:ready|verified|executed|complete|passed|active|enabled)|game\s*capture\s*proof\s*(?:ready|verified|captured|passed|complete)|compatibility\s*certification\s*(?:ready|verified|passed|complete|certified)|live\s*title\s*validation\s*(?:ready|verified|passed|complete)|external\s*overlay\s*window\s*(?:opened|attached|verified|passed|complete|proof\s*ready)|overlay\s*e2e\s*(?:passed|ready|verified|complete|success)|real\s*game\s*process\s*(?:accessed|attached|validated|captured|ready|verified))\b/i;

describe("OverlayFullscreenAntiCheatReadinessPanel", () => {
  it("renders local research gates without fullscreen or anti-cheat claims", () => {
    render(
      <OverlayFullscreenAntiCheatReadinessPanel
        readiness={createVerifyOverlayFullscreenAntiCheatReadiness()}
      />,
    );

    const panel = screen.getByRole("region", {
      name: /overlay fullscreen anti-cheat readiness/i,
    });

    expect(within(panel).getByText("Overlay Fullscreen / Anti-Cheat")).toBeInTheDocument();
    expect(within(panel).getByText("Fullscreen mode inventory")).toBeInTheDocument();
    expect(within(panel).getByText("Desktop overlay settings")).toBeInTheDocument();
    expect(within(panel).getByText("Anti-cheat fallback deck")).toBeInTheDocument();
    expect(within(panel).getByText("Fullscreen injection")).toBeInTheDocument();
    expect(within(panel).getByText("Protected-process attach")).toBeInTheDocument();
    expect(within(panel).getByText("Kernel/driver install")).toBeInTheDocument();
    expect(within(panel).getByText("External overlay window proof")).toBeInTheDocument();
    expect(within(panel).getByText("Game capture proof")).toBeInTheDocument();
    expect(within(panel).getByText("Live title validation")).toBeInTheDocument();
    expect(within(panel).getByText("Compatibility certification")).toBeInTheDocument();
    expect(within(panel).getByText("No fullscreen injection")).toBeInTheDocument();
    expect(within(panel).getByText("No anti-cheat bypass")).toBeInTheDocument();
    expect(within(panel).getByText("No real game process access")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(falseOverlayFullscreenClaim);
  });
});
