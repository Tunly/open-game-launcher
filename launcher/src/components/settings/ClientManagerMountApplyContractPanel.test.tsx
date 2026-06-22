import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  createVerifyClientManagerMountApplyContract,
  createVerifyClientManagerMountApplySandboxProof,
} from "../../lib/client-manager-mount-apply-contract";
import { ClientManagerMountApplyContractPanel } from "./ClientManagerMountApplyContractPanel";

describe("ClientManagerMountApplyContractPanel", () => {
  it("renders local mount/apply contract lanes without real apply claims", () => {
    render(
      <ClientManagerMountApplyContractPanel
        contract={createVerifyClientManagerMountApplyContract()}
      />,
    );

    const panel = screen.getByRole("region", {
      name: /client manager mount apply contract/i,
    });

    expect(within(panel).getByText("Mount Apply Contract")).toBeInTheDocument();
    expect(within(panel).getByText("Path Overlay Preflight")).toBeInTheDocument();
    expect(within(panel).getByText("Asset Cache Lookup")).toBeInTheDocument();
    expect(within(panel).getByText("Auto-Apply Guard")).toBeInTheDocument();
    expect(within(panel).getByText("Provider Mechanism")).toBeInTheDocument();
    expect(within(panel).getByText("OS Mount Sandbox")).toBeInTheDocument();
    expect(within(panel).getByText("Rollback + Unmount")).toBeInTheDocument();
    expect(within(panel).getByText("Terms Approval")).toBeInTheDocument();
    const capabilities = within(panel).getByRole("region", {
      name: /client manager auto apply capability check/i,
    });
    expect(within(capabilities).getByText("Auto-Apply Capability Check")).toBeInTheDocument();
    expect(within(capabilities).getByText("Runtime Presence")).toBeInTheDocument();
    expect(within(capabilities).getByText("Install Target")).toBeInTheDocument();
    expect(within(capabilities).getByText("Free Disk Space")).toBeInTheDocument();
    expect(within(capabilities).getByText("Admin Review")).toBeInTheDocument();
    expect(within(capabilities).getByText("3/4 Local Gates")).toBeInTheDocument();
    const matrix = within(panel).getByRole("region", {
      name: /client manager provider policy matrix/i,
    });
    expect(within(matrix).getByText("Provider Policy Matrix")).toBeInTheDocument();
    expect(within(matrix).getByText("Steam")).toBeInTheDocument();
    expect(within(matrix).getByText("GOG")).toBeInTheDocument();
    expect(within(matrix).getByText("Epic")).toBeInTheDocument();
    expect(within(matrix).getByText("EA")).toBeInTheDocument();
    expect(within(matrix).getByText("Ubisoft")).toBeInTheDocument();
    expect(within(matrix).getByText("Battle.net")).toBeInTheDocument();
    expect(within(matrix).getByText("Xbox / Game Pass")).toBeInTheDocument();
    expect(within(matrix).getAllByText("No provider-approved launcher apply")).toHaveLength(7);
    expect(within(matrix).getAllByText("Terms: Terms not approved")).toHaveLength(7);
    expect(within(panel).getByText("No real provider mount application")).toBeInTheDocument();
    expect(within(panel).getByText("No provider auto-apply")).toBeInTheDocument();
    expect(within(panel).getByText("No symlink or junction creation")).toBeInTheDocument();
    expect(within(panel).getByText("No admin elevation")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /(real mount (?:applied|complete|ready|verified)|provider auto-apply(?: approved| complete| ready| verified)|symlink(?: created| ready)|junction(?: created| ready)|driver (?:installed|ready)|admin elevation (?:granted|ready)|destructive writes? (?:complete|ready)|client mutation (?:verified|complete)|terms approved|rollback (?:verified|complete)|unmount proof (?:verified|complete))/i,
    );
  });

  it("renders sandbox apply rollback proof without live provider mutation claims", () => {
    render(
      <ClientManagerMountApplyContractPanel
        contract={createVerifyClientManagerMountApplyContract(
          createVerifyClientManagerMountApplySandboxProof(),
        )}
        sandboxControls={{
          busy: false,
          isDesktopRuntime: false,
          message: "Verification fixture loaded for local sandbox apply/rollback proof.",
          onLoadFixture: () => undefined,
          onRunProof: () => undefined,
          onSourcePathChange: () => undefined,
          onTargetPathChange: () => undefined,
          sourcePath: "/tmp/og-client-manager-sandbox/source",
          targetPath: "/tmp/og-client-manager-sandbox/target",
        }}
      />,
    );

    const proofPanel = screen.getByRole("region", {
      name: /client manager sandbox apply rollback proof/i,
    });
    const panel = screen.getByRole("region", {
      name: /client manager mount apply contract/i,
    });
    expect(within(proofPanel).getByText("Apply / Rollback Rehearsal")).toBeInTheDocument();
    expect(within(proofPanel).getByText("Sandbox Proof Ready")).toBeInTheDocument();
    expect(within(panel).getByText("Sandbox rollback proof only")).toBeInTheDocument();
    expect(
      within(panel).getByRole("region", {
        name: /client manager provider policy matrix/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole("region", {
        name: /client manager auto apply capability check/i,
      }),
    ).toBeInTheDocument();
    expect(proofPanel).toHaveTextContent("Provider Paths: not touched");
    expect(proofPanel).toHaveTextContent("Mounts Created: no");
    expect(proofPanel).not.toHaveTextContent(
      /(provider auto-apply ready|live client mutation proof|terms approved|symlink created|junction created|admin elevation granted)/i,
    );
  });
});
