import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyMobileSessionLibraryChatContract } from "../../lib/mobile-session-library-chat-contract";
import { MobileSessionLibraryChatContractPanel } from "./MobileSessionLibraryChatContractPanel";

const falseMobileContractClaim =
  /\b(?:native\s*(?:ios|android)\s*app\s*(?:ready|shipped|released|installed)|mobile\s*(?:auth|session)\s*(?:issued|stored|verified|complete)|(?:access|refresh)\s*token\s*(?:stored|used|issued|read|written|raw)|chat\s*(?:message\s*)?(?:sent|inserted|delivered)|supabase\s*(?:write|insert|update)\s*(?:complete|succeeded|verified)|apns\s*(?:request\s*)?sent|fcm\s*(?:request\s*)?sent|push\s*(?:notification\s*)?(?:sent|delivered)|app\s*store\s*(?:live|released|approved)|hosted\s*production\s*e2e\s*(?:passed|complete|verified))\b/i;

describe("MobileSessionLibraryChatContractPanel", () => {
  it("renders scoped session/library/chat evidence without native mobile claims", () => {
    render(
      <MobileSessionLibraryChatContractPanel
        contract={createVerifyMobileSessionLibraryChatContract()}
      />,
    );

    const panel = screen.getByRole("region", {
      name: /mobile session library chat contract/i,
    });

    expect(within(panel).getByText("Session / Library / Chat")).toBeInTheDocument();
    expect(within(panel).getByText("Session Envelope")).toBeInTheDocument();
    expect(within(panel).getByText("Scoped Library Projection")).toBeInTheDocument();
    expect(within(panel).getByText("Chat Send Queue Policy")).toBeInTheDocument();
    expect(within(panel).getByText("Token Redaction")).toBeInTheDocument();
    expect(within(panel).getByText("No live mobile session")).toBeInTheDocument();
    expect(within(panel).getByText("No native iOS/Android app build")).toBeInTheDocument();
    expect(within(panel).getByText("No raw access/refresh token")).toBeInTheDocument();
    expect(within(panel).getByText("No Supabase write from verify route")).toBeInTheDocument();
    expect(within(panel).getByText("No game_sessions upsert/update/delete")).toBeInTheDocument();
    expect(within(panel).getByText("No chat_messages insert")).toBeInTheDocument();
    expect(within(panel).getByText("No realtime subscription opened")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(falseMobileContractClaim);
  });
});
