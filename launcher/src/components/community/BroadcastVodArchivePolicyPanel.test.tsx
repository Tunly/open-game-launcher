import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyBroadcastVodArchivePolicy } from "../../lib/broadcast-vod-archive-policy";
import { BroadcastVodArchivePolicyPanel } from "./BroadcastVodArchivePolicyPanel";

describe("BroadcastVodArchivePolicyPanel", () => {
  it("renders local VOD archive policy without hosted archive claims", () => {
    render(<BroadcastVodArchivePolicyPanel policy={createVerifyBroadcastVodArchivePolicy()} />);

    const panel = screen.getByRole("region", { name: /broadcasting vod archive policy/i });

    expect(within(panel).getByText("VOD Archive Policy")).toBeInTheDocument();
    expect(within(panel).getByText("Local policy review")).toBeInTheDocument();
    expect(within(panel).getByText("Retention draft")).toBeInTheDocument();
    expect(within(panel).getByText("Visibility review")).toBeInTheDocument();
    expect(within(panel).getByText("Delete coverage")).toBeInTheDocument();
    expect(within(panel).getByText("No Twitch/YouTube OAuth")).toBeInTheDocument();
    expect(within(panel).getByText("No OAuth token exchange")).toBeInTheDocument();
    expect(within(panel).getByText("No RTMP/live output")).toBeInTheDocument();
    expect(within(panel).getByText("No stream-key live use")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted chat moderation")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted enforcement")).toBeInTheDocument();
    expect(within(panel).getByText("No VOD provider sync")).toBeInTheDocument();
    expect(within(panel).getByText("No Supabase archive write")).toBeInTheDocument();
    expect(within(panel).getByText("No signed URL request")).toBeInTheDocument();
    expect(within(panel).getByText("No public storage serve")).toBeInTheDocument();
    expect(within(panel).getByText("No VOD sync job")).toBeInTheDocument();
    expect(within(panel).getByText("No provider archive import")).toBeInTheDocument();
    expect(within(panel).getByText("No delete request sent")).toBeInTheDocument();
    expect(within(panel).getByText("No audience/live-status claim")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /\b(?:(?:twitch|youtube|provider)\s*(?:oauth|vod|archive|video)\s*(?:ready|verified|connected|enabled|synced|complete|imported|published)|vod\s+archive\s+policy\s*(?:ready|verified|synced|enabled|complete)|vod(?:\s+(?:provider|archive))?\s*(?:sync|archive|import|publish|delete|retention)\s*(?:ready|verified|synced|enabled|complete|executed|applied)|archive\s*(?:created|written|served|published|synced|deleted)|supabase\s*(?:vod|archive(?:\s+row)?|storage|bucket|row)\s*(?:ready|verified|synced|enabled|written|inserted|updated|served|complete)|signed\s+url\s*(?:ready|created|generated|served)|public\s+storage\s*(?:ready|served|enabled|synced)|(?:rtmp(?:\/live|\s+live|\s+ingest)?|live\s+output)\s*(?:ready|connected|enabled|started)|audience(?:\/live)?\s*status\s*(?:ready|updated|online)|hosted\s*(?:moderation|archive|vod)\s*(?:ready|verified|enabled|synced|complete))\b/i,
    );
  });
});
