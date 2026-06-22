import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyBroadcastProviderCallbackContract } from "../../lib/broadcast-provider-callback-contract";
import { BroadcastProviderCallbackContractPanel } from "./BroadcastProviderCallbackContractPanel";

describe("BroadcastProviderCallbackContractPanel", () => {
  it("renders local callback contract evidence without hosted callback claims", () => {
    render(
      <BroadcastProviderCallbackContractPanel
        contract={createVerifyBroadcastProviderCallbackContract()}
      />,
    );

    const panel = screen.getByRole("region", {
      name: /broadcasting provider callback contract/i,
    });

    expect(within(panel).getByText("Provider Callback Contract")).toBeInTheDocument();
    expect(within(panel).getByText("Local contract review")).toBeInTheDocument();
    expect(within(panel).getByText("Event schema fixture")).toBeInTheDocument();
    expect(within(panel).getByText("Signature header checklist")).toBeInTheDocument();
    expect(within(panel).getByText("Idempotency key plan")).toBeInTheDocument();
    expect(within(panel).getByText("Replay duplicate fixture")).toBeInTheDocument();
    expect(within(panel).getByText("Redacted audit row shape")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted endpoint")).toBeInTheDocument();
    expect(within(panel).getByText("Provider delivery")).toBeInTheDocument();
    expect(within(panel).getByText("Supabase callback row")).toBeInTheDocument();
    expect(within(panel).getByText("Local contract fixtures only")).toBeInTheDocument();
    expect(within(panel).getByText("No Twitch/YouTube OAuth")).toBeInTheDocument();
    expect(within(panel).getByText("No OAuth token exchange")).toBeInTheDocument();
    expect(within(panel).getByText("No RTMP/live output")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted endpoint deployment")).toBeInTheDocument();
    expect(within(panel).getByText("No callback runner")).toBeInTheDocument();
    expect(within(panel).getByText("No provider delivery proof")).toBeInTheDocument();
    expect(within(panel).getByText("No signature proof")).toBeInTheDocument();
    expect(within(panel).getByText("No Supabase callback row mutation")).toBeInTheDocument();
    expect(within(panel).getByText("Replay fixture only")).toBeInTheDocument();
    expect(within(panel).getByText("No replay runner")).toBeInTheDocument();
    expect(within(panel).getByText("No VOD sync job")).toBeInTheDocument();
    expect(within(panel).getByText("No audience/live-status claim")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /\b(?:(?:twitch|youtube|provider)\s*(?:oauth|callback|webhook|event)\s*(?:ready|verified|connected|enabled|complete|received|processed)|oauth\s*(?:token\s*)?(?:exchanged|connected|verified|complete)|(?:rtmp(?:\/live|\s+live|\s+ingest)?|live\s+output)\s*(?:ready|connected|enabled|started|published)|hosted\s*(?:callback|webhook|endpoint|function)\s*(?:executed|execution|ready|verified|enabled|deployed|complete|called)|supabase\s*(?:callback|webhook|broadcast(?:ing)?|row|audit)\s*(?:write|writes|written|inserted|updated|synced|ready|verified|complete)|provider\s*webhooks?\s*(?:received|verified|processed|complete)|callback\s+row\s*(?:inserted|written|processed|verified)|callback\s*(?:received|verified|processed|complete)|webhook\s*(?:received|verified|processed|complete)|replay\s*(?:processed|replayed|drained|complete)|vod(?:\s+provider)?\s*(?:sync|archive)\s*(?:ready|verified|synced|enabled|complete|processed)|audience(?:\/live)?\s*status\s*(?:ready|updated|online|synced)|live\s*status\s*(?:ready|updated|online|synced))\b/i,
    );
  });
});
