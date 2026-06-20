import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyMobileAppPushDryRunPacket } from "../../lib/mobile-app-push-dry-run";
import { MobileAppPushDryRunPanel } from "./MobileAppPushDryRunPanel";

describe("MobileAppPushDryRunPanel", () => {
  it("renders a local push packet with target, payload, consent, token safety, and no writes", () => {
    render(<MobileAppPushDryRunPanel packet={createVerifyMobileAppPushDryRunPacket()} />);

    const panel = screen.getByRole("region", { name: /mobile app push dry-run packet/i });

    expect(within(panel).getByText("Push Dry-Run Packet")).toBeInTheDocument();
    expect(within(panel).getByText("Target / Platform")).toBeInTheDocument();
    expect(within(panel).getByText("iOS / APNs staging")).toBeInTheDocument();
    expect(within(panel).getByText("Steam Deck Companion")).toBeInTheDocument();
    expect(within(panel).getAllByText("Payload Preview").length).toBeGreaterThan(0);
    expect(within(panel).getByText("Remote install ready")).toBeInTheDocument();
    expect(
      within(panel).getByText("Neon Circuit is queued for desktop claim."),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Consent staged")).toBeInTheDocument();
    expect(within(panel).getByText("apns...c999")).toBeInTheDocument();
    expect(within(panel).getAllByText("Writes: none").length).toBeGreaterThan(0);
    expect(within(panel).getByText("No push notification send")).toBeInTheDocument();
    expect(within(panel).getByText("No APNs/FCM network call")).toBeInTheDocument();
    expect(within(panel).getByText("No device-token write")).toBeInTheDocument();
    expect(within(panel).getByText("No Supabase write")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /push sent|notification delivered|device token stored|supabase write complete|supabase write succeeded|apns request sent|fcm request sent|apns-live-device-token/i,
    );
  });
});
