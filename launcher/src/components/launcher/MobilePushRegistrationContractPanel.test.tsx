import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyMobilePushRegistrationContract } from "../../lib/mobile-push-registration-readiness";
import { MobilePushRegistrationContractPanel } from "./MobilePushRegistrationContractPanel";

describe("MobilePushRegistrationContractPanel", () => {
  it("renders registration contract evidence without raw-token or push-send claims", () => {
    render(
      <MobilePushRegistrationContractPanel
        contract={createVerifyMobilePushRegistrationContract()}
      />,
    );

    const panel = screen.getByRole("region", {
      name: /mobile push registration contract/i,
    });

    expect(within(panel).getByText("Push Registration Contract")).toBeInTheDocument();
    expect(within(panel).getByText("iOS / APNs token hash")).toBeInTheDocument();
    expect(within(panel).getByText("Steam Deck Companion")).toBeInTheDocument();
    expect(
      within(panel).getByText("Verify route: no write; hosted Edge Function writes only"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Consent")).toBeInTheDocument();
    expect(within(panel).getByText("Token Hash")).toBeInTheDocument();
    expect(within(panel).getByText("Owner Scope")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted Edge Function")).toBeInTheDocument();
    expect(within(panel).getByText("Unregister")).toBeInTheDocument();
    expect(within(panel).getByText("Provider Send Block")).toBeInTheDocument();
    expect(within(panel).getByText("No raw device token")).toBeInTheDocument();
    expect(within(panel).getByText("No APNs/FCM send")).toBeInTheDocument();
    expect(within(panel).getByText("No verify-route Supabase write")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted Edge Function uses service role")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /apns-live-device-token|push sent|notification delivered|apns request sent|fcm request sent|device token stored|supabase write complete/i,
    );
  });
});
