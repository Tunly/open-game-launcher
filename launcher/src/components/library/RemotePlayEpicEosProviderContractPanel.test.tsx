import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyRemotePlayEpicEosProviderContract } from "../../lib/remote-play-epic-eos-provider-contract";
import { RemotePlayEpicEosProviderContractPanel } from "./RemotePlayEpicEosProviderContractPanel";

describe("RemotePlayEpicEosProviderContractPanel", () => {
  it("renders local Epic/EOS provider-state evidence without live provider claims", () => {
    render(
      <RemotePlayEpicEosProviderContractPanel
        contract={createVerifyRemotePlayEpicEosProviderContract()}
      />,
    );

    const panel = screen.getByRole("region", {
      name: /epic\/eos remote play provider contract/i,
    });

    expect(within(panel).getByText("Epic/EOS Provider States")).toBeInTheDocument();
    expect(within(panel).getByText("Provider Proof Required")).toBeInTheDocument();
    expect(within(panel).getByText("Provider Session State")).toBeInTheDocument();
    expect(within(panel).getByText("Invite Envelope")).toBeInTheDocument();
    expect(within(panel).getByText("Launch URI Fallback")).toBeInTheDocument();
    expect(within(panel).getByText("Provider Error Map")).toBeInTheDocument();
    expect(within(panel).getByText("Streaming Proof")).toBeInTheDocument();
    expect(within(panel).getByText("Fixture State Replay")).toBeInTheDocument();
    expect(within(panel).getByText("session-state-replay")).toBeInTheDocument();
    expect(within(panel).getByText("invite-draft -> local-envelope-review")).toBeInTheDocument();
    expect(within(panel).getByText("allow-launcher-uri")).toBeInTheDocument();
    expect(within(panel).getAllByText("No Epic/EOS provider session proof")).toHaveLength(2);
    expect(within(panel).getAllByText("No Epic/EOS invite delivery")).toHaveLength(2);
    expect(panel).not.toHaveTextContent(
      /(provider session active|epic invite delivered|eos invite accepted|live stream started|streaming verified|provider token:|bearer\s+[a-z0-9._~+/=-]{12,})/i,
    );
  });
});
