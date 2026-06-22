import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyOneClickSetupE2EReadiness } from "../../lib/one-click-setup-e2e-readiness";
import { OneClickSetupE2EReadinessPanel } from "./OneClickSetupE2EReadinessPanel";

describe("OneClickSetupE2EReadinessPanel", () => {
  it("renders local hosted/provider setup gates without E2E automation claims", () => {
    render(<OneClickSetupE2EReadinessPanel readiness={createVerifyOneClickSetupE2EReadiness()} />);

    const panel = screen.getByRole("region", {
      name: /one-click setup e2e readiness/i,
    });

    expect(within(panel).getByText("Hosted Setup E2E")).toBeInTheDocument();
    expect(within(panel).getByText("Local Setup Tape")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted Auth")).toBeInTheDocument();
    expect(within(panel).getByText("Provider OAuth")).toBeInTheDocument();
    expect(within(panel).getByText("Token Replay")).toBeInTheDocument();
    expect(within(panel).getByText("Silent Install")).toBeInTheDocument();
    expect(within(panel).getByText("Consent + Terms")).toBeInTheDocument();
    expect(within(panel).getByText("Rollback Audit")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted auth E2E")).toBeInTheDocument();
    expect(within(panel).getByText("No OAuth/token replay")).toBeInTheDocument();
    expect(within(panel).getByText("No provider-approved silent install")).toBeInTheDocument();
    expect(within(panel).getByText("No consent/terms approval")).toBeInTheDocument();
    expect(within(panel).getByText("No rollback/audit claim")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /(hosted auth verified|hosted session verified|oauth replay(?:ed| complete)|provider oauth replayed|token replay(?:ed| complete)|tokens? restored|keychain migrated|silent install (?:started|ready|complete)|provider install approved|auto-?install(?:ed| complete)?|setup (?:completed|replayed)|consent approved|terms approved|rollback verified|audit (?:verified|complete))/i,
    );
  });
});
