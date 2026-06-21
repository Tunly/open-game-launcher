import { describe, expect, it } from "vitest";

import {
  buildLanTransferNativeCopyReadiness,
  createVerifyLanTransferNativeCopyReadiness,
} from "../lan-transfer-native-copy-readiness";

describe("buildLanTransferNativeCopyReadiness", () => {
  it("keeps LAN native-copy staging local while surfacing copy and manifest proof", () => {
    const readiness = createVerifyLanTransferNativeCopyReadiness();

    expect(readiness.statusLabel).toBe("Needs staging");
    expect(readiness.readyCount).toBe(4);
    expect(readiness.warningCount).toBe(3);
    expect(readiness.blockedCount).toBe(0);
    expect(readiness.guards).toContain("No live LAN peer broadcast");
    expect(readiness.guards).toContain("No trusted pairing exchange");
    expect(readiness.guards).toContain("No firewall rule changes");
    expect(readiness.guards).toContain("Local copy-job cancel only");
    expect(readiness.guards).toContain("No automatic network share mount");
    expect(readiness.guardCopy).toContain("peer-discovery preflight contract");
    expect(readiness.guardCopy).toContain("does not broadcast on the LAN");
    expect(readiness.guardCopy).toContain("manifest hash verification");
    expect(readiness.guardCopy).toContain("cancellable local copy jobs");
    expect(readiness.guardCopy).toContain("resume-copy");
    expect(readiness.guardCopy).toContain("consent-gated cleanup-candidate deletion");
    expect(readiness.guardCopy).toContain("signed-device trust review evidence");
    expect(readiness.summary).toContain("peer-discovery preflight");
    expect(readiness.summary).toContain("firewall policy evidence");
    expect(readiness.gates.find((gate) => gate.id === "peer-discovery")?.status).toBe("warning");
    expect(readiness.gates.find((gate) => gate.id === "native-copy-engine")?.status).toBe("ready");
    expect(readiness.gates.find((gate) => gate.id === "resume-cancel")?.status).toBe("ready");
    expect(readiness.gates.find((gate) => gate.id === "firewall-policy")?.status).toBe("warning");
    expect(readiness.gates.find((gate) => gate.id === "post-copy-manifest")?.status).toBe("ready");
    expect(readiness.peerDiscoveryPreflight?.label).toBe("Peer Discovery Preflight");
    expect(readiness.peerDiscoveryPreflight?.consentOperation).toBe(
      "lan_peer_discovery_preflight_review",
    );
    expect(readiness.peerDiscoveryPreflight?.guards).toContain("No UDP broadcast is sent");
    expect(readiness.peerDiscoveryPreflight?.guards).toContain("No relay request is executed");
    expect(readiness.peerDiscoveryPreflight?.guards).toContain("Candidate endpoints stay redacted");
    expect(readiness.peerDiscoveryPreflight?.candidates.map((candidate) => candidate.id)).toEqual([
      "mdns-private-lan",
      "relay-lookup-token",
      "manual-share-path",
    ]);
    expect(
      readiness.peerDiscoveryPreflight?.candidates.map((candidate) => candidate.redactedEndpoint),
    ).toEqual([
      "192.168.x.x:_ogl-lan-copy._tcp",
      "relay://paired-device/<redacted>",
      "\\\\host\\share\\<game>",
    ]);
    expect(readiness.firewallPolicyEvidence?.label).toBe("Firewall + Discovery Policy");
    expect(readiness.firewallPolicyEvidence?.guards).toContain(
      "No automatic inbound rule creation",
    );
    expect(readiness.firewallPolicyEvidence?.guards).toContain(
      "Port probes stay redacted and rate-limited",
    );
    expect(readiness.firewallPolicyEvidence?.platformRules.map((rule) => rule.platform)).toEqual([
      "Windows",
      "macOS",
      "Linux",
    ]);
    expect(readiness.firewallPolicyEvidence?.summary).not.toMatch(
      /firewall opened|rule applied|port opened|peer discovery active/i,
    );
    expect(readiness.peerDiscoveryPreflight?.summary).not.toMatch(
      /broadcast sent|relay called|peer selected|share mounted/i,
    );
    expect(readiness.pairingTrustEvidence?.label).toBe("Signed Device Trust");
    expect(readiness.pairingTrustEvidence?.guards).toContain("No peer secret exchange");
    expect(readiness.pairingTrustEvidence?.guards).toContain("No device secret display");
    expect(readiness.pairingTrustEvidence?.guards).toContain("No auto-trust after discovery");
    expect(readiness.pairingTrustEvidence?.checks.map((check) => check.id)).toEqual([
      "device-fingerprint",
      "challenge-packet",
      "revocation-ledger",
    ]);
    expect(JSON.stringify(readiness.pairingTrustEvidence)).not.toMatch(
      /deviceSecret|peer secret exchanged|copy unlocked|trusted pairing established/i,
    );
  });

  it("blocks every gate when local planner evidence is absent", () => {
    const readiness = buildLanTransferNativeCopyReadiness({
      firewallPolicyReady: false,
      localPlannerReady: false,
      manifestVerificationReady: false,
      nativeCopyEngineReady: false,
      pairingTrustReady: false,
      peerDiscoveryReady: false,
      resumeCancelReady: false,
    });

    expect(readiness.blockedCount).toBe(7);
    expect(readiness.firewallPolicyEvidence).toBeNull();
    expect(readiness.pairingTrustEvidence).toBeNull();
    expect(readiness.peerDiscoveryPreflight).toBeNull();
    expect(readiness.nextAction).toBe(
      "Restore local LAN transfer planning before staging native copy work.",
    );
  });

  it("keeps network automation capabilities in review even when evidence exists", () => {
    const readiness = buildLanTransferNativeCopyReadiness({
      firewallPolicyReady: true,
      localPlannerReady: true,
      manifestVerificationReady: true,
      nativeCopyEngineReady: true,
      pairingTrustReady: true,
      peerDiscoveryReady: true,
      resumeCancelReady: true,
    });

    expect(readiness.blockedCount).toBe(0);
    expect(readiness.readyCount).toBe(4);
    expect(readiness.warningCount).toBe(3);
    expect(readiness.statusLabel).toBe("Needs staging");
    expect(readiness.gates.find((gate) => gate.id === "native-copy-engine")?.status).toBe("ready");
  });
});
