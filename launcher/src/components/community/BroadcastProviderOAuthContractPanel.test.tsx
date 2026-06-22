import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyBroadcastProviderOAuthContract } from "../../lib/broadcast-provider-oauth-contract";
import { BroadcastProviderOAuthContractPanel } from "./BroadcastProviderOAuthContractPanel";

describe("BroadcastProviderOAuthContractPanel", () => {
  it("renders local OAuth contract evidence without provider OAuth claims", () => {
    render(
      <BroadcastProviderOAuthContractPanel
        contract={createVerifyBroadcastProviderOAuthContract()}
      />,
    );

    const panel = screen.getByRole("region", {
      name: /broadcasting provider oauth contract/i,
    });

    expect(within(panel).getByText("Provider OAuth Contract")).toBeInTheDocument();
    expect(within(panel).getByText("Local OAuth contract")).toBeInTheDocument();
    expect(within(panel).getByText("PKCE challenge fixture")).toBeInTheDocument();
    expect(within(panel).getByText("State nonce fixture")).toBeInTheDocument();
    expect(within(panel).getByText("Redirect URI allowlist")).toBeInTheDocument();
    expect(within(panel).getByText("Provider scope review")).toBeInTheDocument();
    expect(within(panel).getByText("Callback error taxonomy")).toBeInTheDocument();
    expect(within(panel).getByText("Token storage boundary")).toBeInTheDocument();
    expect(within(panel).getByText("Redacted secret handling")).toBeInTheDocument();
    expect(within(panel).getByText("Provider app registration")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted callback endpoint")).toBeInTheDocument();
    expect(within(panel).getByText("OAuth authorize launch")).toBeInTheDocument();
    expect(within(panel).getByText("Token exchange")).toBeInTheDocument();
    expect(within(panel).getByText("Provider chat/VOD handoff")).toBeInTheDocument();
    expect(within(panel).getByText("Local OAuth contract only")).toBeInTheDocument();
    expect(within(panel).getByText("No Twitch/YouTube OAuth")).toBeInTheDocument();
    expect(within(panel).getByText("No OAuth authorization redirect")).toBeInTheDocument();
    expect(within(panel).getByText("No OAuth token exchange")).toBeInTheDocument();
    expect(within(panel).getByText("No provider access token stored")).toBeInTheDocument();
    expect(within(panel).getByText("No provider chat read")).toBeInTheDocument();
    expect(within(panel).getByText("No VOD provider sync")).toBeInTheDocument();
    expect(within(panel).getByText("No RTMP/live output")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted callback endpoint")).toBeInTheDocument();
    expect(within(panel).getByText("No audience/live-status claim")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /\b(?:(?:twitch|youtube|provider)\s*(?:oauth|authorization|auth|token|chat|vod|live)\s*(?:ready|verified|connected|enabled|complete|authorized|stored|synced)|oauth\s*(?:authorization|redirect|token|exchange)\s*(?:ready|opened|sent|complete|verified|connected|enabled|exchanged)|token\s*(?:exchange|request|storage|refresh|revocation)\s*(?:ready|sent|complete|verified|connected|enabled|stored)|provider\s*(?:chat|vod)\s*(?:read|sync|archive)\s*(?:ready|verified|synced|enabled|complete)|hosted\s*(?:oauth|callback|endpoint|function)\s*(?:ready|verified|enabled|deployed|complete|called)|(?:rtmp(?:\/live|\s+live|\s+ingest)?|live\s+output)\s*(?:ready|connected|enabled|started|published)|audience(?:\/live)?\s*status\s*(?:ready|updated|online|synced))\b/i,
    );
  });
});
