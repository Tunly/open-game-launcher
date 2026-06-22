import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  applyProfilePrivacyGuard,
  createVerifyProfilePrivacyGuardData,
} from "../../lib/profile-privacy-guard";
import { ProfileShowcaseGrid } from "./ProfileShowcaseGrid";

const privateFixtureTerms =
  /Private Backlog RPG|RTX Private Lab|Secret Guestbook|Friends Raid Session|Hidden Boss Clear|Private Showcase Notes/i;

describe("ProfileShowcaseGrid privacy states", () => {
  it("shows guarded showcase copy instead of empty public data states", () => {
    const source = createVerifyProfilePrivacyGuardData();
    source.showcases = [];
    const { data, guard } = applyProfilePrivacyGuard(source, {
      isFriend: false,
      isOwnProfile: false,
      route: "/u/localprivacy",
    });

    render(<ProfileShowcaseGrid data={data} privacyGuard={guard} />);

    expect(screen.getByText("Library Preview")).toBeInTheDocument();
    expect(screen.getByText("Hardware Setup")).toBeInTheDocument();
    expect(screen.getByText("Achievement Strip")).toBeInTheDocument();
    expect(screen.getByText("Activity Feed")).toBeInTheDocument();
    expect(
      screen.getAllByText("Hidden by this profile's privacy rules for the current viewer.").length,
    ).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText("No public library games yet.")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(privateFixtureTerms);
  });
});
