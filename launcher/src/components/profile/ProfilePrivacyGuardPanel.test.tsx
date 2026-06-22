import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  applyProfilePrivacyGuard,
  createVerifyProfilePrivacyGuardData,
} from "../../lib/profile-privacy-guard";
import { ProfilePrivacyGuardPanel } from "./ProfilePrivacyGuardPanel";

const privateFixtureTerms =
  /Private Backlog RPG|RTX Private Lab|Secret Guestbook|Friends Raid Session|Hidden Boss Clear|Private Showcase Notes/i;

describe("ProfilePrivacyGuardPanel", () => {
  it("renders public privacy evidence without leaking redacted profile data", () => {
    const { guard } = applyProfilePrivacyGuard(createVerifyProfilePrivacyGuardData(), {
      isFriend: false,
      isOwnProfile: false,
      route: "/u/localprivacy",
    });

    render(<ProfilePrivacyGuardPanel guard={guard} />);

    const panel = screen.getByRole("region", {
      name: /public profile privacy guard/i,
    });

    expect(within(panel).getByText("Public Profile Privacy Guard")).toBeInTheDocument();
    expect(within(panel).getByText("Public Safe")).toBeInTheDocument();
    expect(within(panel).getByText("Library Preview")).toBeInTheDocument();
    expect(within(panel).getByText("Achievement Strip")).toBeInTheDocument();
    expect(within(panel).getByText("Hardware Setup")).toBeInTheDocument();
    expect(within(panel).getByText("No Supabase writes")).toBeInTheDocument();
    expect(within(panel).getByText("No friend graph assumption")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(privateFixtureTerms);
  });
});
