import { describe, expect, it } from "vitest";

import {
  buildClientManagerMountApplyContract,
  createVerifyClientManagerMountApplyContract,
  createVerifyClientManagerMountApplySandboxProof,
} from "../client-manager-mount-apply-contract";

describe("client manager mount/apply contract", () => {
  it("keeps the verify fixture local and blocked around real apply work", () => {
    const contract = createVerifyClientManagerMountApplyContract();

    expect(contract.statusLabel).toBe("Contract only");
    expect(contract.reviewCount).toBe(3);
    expect(contract.readyCount).toBe(0);
    expect(contract.blockedCount).toBe(9);
    expect(contract.progress).toBe(25);
    expect(contract.guards).toEqual(
      expect.arrayContaining([
        "Local contract packet only",
        "No real provider mount application",
        "No provider auto-apply",
        "No symlink or junction creation",
        "No driver/kernel install",
        "No admin elevation",
        "No destructive client writes",
        "No live client mutation proof",
        "No provider terms approval claim",
        "No rollback/unmount proof",
      ]),
    );
    expect(contract.providerPolicySummary).toEqual({
      blocked: 7,
      manualOnly: 0,
      review: 0,
      total: 7,
    });
    expect(contract.providerPolicyMatrix.map((policy) => policy.label)).toEqual([
      "Steam",
      "GOG",
      "Epic",
      "EA",
      "Ubisoft",
      "Battle.net",
      "Xbox App / PC Game Pass",
    ]);
    expect(contract.providerPolicyMatrix.every((policy) => policy.status === "blocked")).toBe(true);
    expect(
      contract.providerPolicyMatrix.every((policy) =>
        /No .*(approval|approved)/i.test(policy.terms),
      ),
    ).toBe(true);
    expect(contract.autoApplyCapabilitySummary).toEqual({
      blocked: 1,
      ready: 2,
      review: 1,
      total: 4,
    });
    expect(contract.autoApplyCapabilities.map((check) => check.label)).toEqual([
      "Runtime Presence",
      "Install Target",
      "Free Disk Space",
      "Admin Review",
    ]);
    expect(
      contract.autoApplyCapabilities.find((check) => check.id === "desktop-runtime")?.status,
    ).toBe("ready");
    expect(
      contract.autoApplyCapabilities.find((check) => check.id === "free-disk-space")?.status,
    ).toBe("ready");
    expect(
      contract.autoApplyCapabilities.find((check) => check.id === "admin-review")?.status,
    ).toBe("blocked");
    expect(contract.lanes.find((lane) => lane.id === "provider-mechanism")?.status).toBe("blocked");
    expect(contract.lanes.find((lane) => lane.id === "terms-approval")?.status).toBe("blocked");
  });

  it("keeps unsafe staging lanes blocked even when a flag is present", () => {
    const contract = buildClientManagerMountApplyContract({
      adminElevationFlowStaged: true,
      assetCacheLookupReady: true,
      autoApplyGuardReady: true,
      destructiveWriteStaged: true,
      driverInstallStaged: true,
      liveClientMutationProofReady: true,
      officialProviderApplyMechanismReady: true,
      osMountSandboxReady: true,
      pathOverlayPreflightReady: true,
      providerTermsApprovalReady: true,
      rollbackUnmountReady: true,
      symlinkJunctionStaged: true,
    });

    expect(contract.lanes.find((lane) => lane.id === "symlink-junction")?.status).toBe("blocked");
    expect(contract.lanes.find((lane) => lane.id === "admin-elevation")?.status).toBe("blocked");
    expect(contract.lanes.find((lane) => lane.id === "driver-install")?.status).toBe("blocked");
    expect(contract.lanes.find((lane) => lane.id === "destructive-writes")?.status).toBe("blocked");
    expect(contract.readyCount).toBe(5);
    expect(contract.reviewCount).toBe(3);
    expect(contract.blockedCount).toBe(4);
    expect(contract.autoApplyCapabilitySummary.blocked).toBe(4);
  });

  it("promotes only sandbox apply and rollback lanes when proof is valid", () => {
    const contract = createVerifyClientManagerMountApplyContract(
      createVerifyClientManagerMountApplySandboxProof(),
    );

    expect(contract.reviewCount).toBe(3);
    expect(contract.readyCount).toBe(2);
    expect(contract.blockedCount).toBe(7);
    expect(contract.progress).toBe(42);
    expect(contract.sandboxProof?.rollbackVerified).toBe(true);
    expect(contract.lanes.find((lane) => lane.id === "os-mount-sandbox")?.status).toBe("ready");
    expect(contract.lanes.find((lane) => lane.id === "rollback-unmount")?.status).toBe("ready");
    expect(contract.lanes.find((lane) => lane.id === "provider-mechanism")?.status).toBe("blocked");
    expect(contract.guards).toEqual(
      expect.arrayContaining([
        "Local sandbox apply proof only",
        "Sandbox rollback proof only",
        "No real provider mount application",
        "No live client mutation proof",
      ]),
    );
  });

  it("does not emit mount/apply success claims in local evidence copy", () => {
    const contract = createVerifyClientManagerMountApplyContract();
    const searchable = [
      contract.summary,
      contract.nextAction,
      contract.guardCopy,
      contract.autoApplyCapabilityCopy,
      ...contract.guards,
      ...contract.lanes.flatMap((lane) => [lane.label, lane.detail, lane.action, lane.status]),
      ...contract.autoApplyCapabilities.flatMap((check) => [
        check.label,
        check.detail,
        check.action,
        check.status,
      ]),
    ].join(" ");

    expect(searchable).not.toMatch(
      /(real mount (?:applied|complete|ready|verified)|provider apply approved|provider-approved launcher apply ready|launcher apply allowed|provider auto-apply(?: approved| complete| ready| verified)|symlink(?: created| ready)|junction(?: created| ready)|driver (?:installed|ready)|admin elevation (?:granted|ready)|destructive writes? (?:complete|ready)|client mutation (?:verified|complete)|terms (?:accepted|approved)|provider terms approved|rollback (?:verified|complete)|unmount proof (?:verified|complete))/i,
    );
  });
});
