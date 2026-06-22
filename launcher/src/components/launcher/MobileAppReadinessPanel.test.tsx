import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyMobileAppReadiness } from "../../lib/mobile-app-readiness";
import { MobileAppReadinessPanel } from "./MobileAppReadinessPanel";

describe("MobileAppReadinessPanel", () => {
  it("renders local mobile gates without native app, push, or app-store claims", () => {
    render(<MobileAppReadinessPanel readiness={createVerifyMobileAppReadiness()} />);

    const panel = screen.getByRole("region", { name: /mobile app readiness/i });

    expect(within(panel).getByText("Mobile App Readiness")).toBeInTheDocument();
    expect(within(panel).getByText("Device Pairing")).toBeInTheDocument();
    expect(within(panel).getByText("Remote Downloads")).toBeInTheDocument();
    expect(within(panel).getByText("Push Provider")).toBeInTheDocument();
    expect(within(panel).getByText("No native iOS/Android app")).toBeInTheDocument();
    expect(within(panel).getByText("No push notification send")).toBeInTheDocument();
    expect(within(panel).getByText("No app-store distribution")).toBeInTheDocument();
    expect(within(panel).getByText("No background mobile download")).toBeInTheDocument();
    expect(within(panel).getByText("No live hosted deployment")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(/ios app shipped|push sent|app store live/i);
  });
});
