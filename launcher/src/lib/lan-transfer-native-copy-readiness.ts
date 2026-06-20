export type LanTransferNativeCopyStatus = "blocked" | "ready" | "warning";

export interface LanTransferNativeCopyReadinessInput {
  firewallPolicyReady: boolean;
  localPlannerReady: boolean;
  manifestVerificationReady: boolean;
  nativeCopyEngineReady: boolean;
  pairingTrustReady: boolean;
  peerDiscoveryReady: boolean;
  resumeCancelReady: boolean;
}

export interface LanTransferNativeCopyGate {
  action: string;
  detail: string;
  id: string;
  label: string;
  status: LanTransferNativeCopyStatus;
}

export interface LanTransferFirewallPlatformRule {
  blockedAutomation: string;
  fallback: string;
  platform: string;
  prompt: string;
  scope: string;
}

export interface LanTransferFirewallPolicyEvidence {
  guards: string[];
  label: string;
  platformRules: LanTransferFirewallPlatformRule[];
  status: Extract<LanTransferNativeCopyStatus, "warning">;
  summary: string;
}

export interface LanTransferPeerDiscoveryCandidate {
  identityProof: string;
  id: string;
  label: string;
  redactedEndpoint: string;
  selectionPolicy: string;
  status: Extract<LanTransferNativeCopyStatus, "warning">;
  transport: string;
}

export interface LanTransferPeerDiscoveryPreflight {
  candidates: LanTransferPeerDiscoveryCandidate[];
  consentOperation: string;
  guards: string[];
  label: string;
  rateLimit: string;
  status: Extract<LanTransferNativeCopyStatus, "warning">;
  summary: string;
}

export interface LanTransferNativeCopyReadiness {
  blockedCount: number;
  firewallPolicyEvidence: LanTransferFirewallPolicyEvidence | null;
  gates: LanTransferNativeCopyGate[];
  guardCopy: string;
  guards: string[];
  nextAction: string;
  peerDiscoveryPreflight: LanTransferPeerDiscoveryPreflight | null;
  progress: number;
  readyCount: number;
  statusLabel: string;
  summary: string;
  warningCount: number;
}

const LAN_TRANSFER_NATIVE_COPY_GUARDS = [
  "No live LAN peer broadcast",
  "No trusted pairing exchange",
  "No firewall rule changes",
  "Local copy-job cancel only",
  "No automatic network share mount",
];

const LAN_TRANSFER_NATIVE_COPY_GUARD_COPY =
  "Desktop LAN local-path copy has scoped native copy, cancellable local copy jobs, resume-copy, manifest hash verification, consent-gated cleanup-candidate deletion from a reviewed ledger, and a local peer-discovery preflight contract. This panel still does not broadcast on the LAN, establish trusted pairing exchange, mount network shares, or handle firewall rules.";

const LAN_TRANSFER_FIREWALL_POLICY_EVIDENCE: LanTransferFirewallPolicyEvidence = {
  guards: [
    "Prompt before any OS firewall change",
    "No automatic inbound rule creation",
    "Loopback/local-path copy still works when blocked",
    "Port probes stay redacted and rate-limited",
    "Manual OS instructions before rollout",
  ],
  label: "Firewall + Discovery Policy",
  platformRules: [
    {
      blockedAutomation: "No netsh rule write, elevation prompt, or installer exception is staged.",
      fallback: "Show manual Windows Defender Firewall guidance and keep LAN copy disabled.",
      platform: "Windows",
      prompt: "Explain inbound TCP/UDP scope before the user opens system settings.",
      scope: "Private-network peers only; public networks stay blocked.",
    },
    {
      blockedAutomation: "No pfctl, socket-filter, or app-firewall mutation is staged.",
      fallback: "Use manual System Settings guidance and local-path copy fallback.",
      platform: "macOS",
      prompt: "Explain Local Network permission and firewall scope before discovery.",
      scope: "Signed app identity and user-approved local-network access only.",
    },
    {
      blockedAutomation: "No ufw, firewalld, nftables, or iptables command is staged.",
      fallback: "Show distro-specific manual firewall notes and keep peer discovery disabled.",
      platform: "Linux",
      prompt: "Explain mDNS/relay ports before any distro-specific guidance.",
      scope: "User-approved LAN segment only; relay lookup stays opt-in.",
    },
  ],
  status: "warning",
  summary:
    "Firewall handling is local policy evidence only: OG-Launcher can show prompts, scopes, platform fallbacks, and redacted probe boundaries, but this verify route never opens ports or writes OS firewall rules.",
};

const LAN_TRANSFER_PEER_DISCOVERY_PREFLIGHT: LanTransferPeerDiscoveryPreflight = {
  candidates: [
    {
      id: "mdns-private-lan",
      identityProof: "Requires signed device identity before copy unlock.",
      label: "mDNS Private LAN",
      redactedEndpoint: "192.168.x.x:_ogl-lan-copy._tcp",
      selectionPolicy: "Manual selection only after trust review.",
      status: "warning",
      transport: "Multicast DNS service advert",
    },
    {
      id: "relay-lookup-token",
      identityProof: "Requires paired relay token hash and device fingerprint.",
      label: "Relay Lookup",
      redactedEndpoint: "relay://paired-device/<redacted>",
      selectionPolicy: "No automatic copy; candidate becomes review-only lane.",
      status: "warning",
      transport: "Hosted relay candidate lookup",
    },
    {
      id: "manual-share-path",
      identityProof: "Requires source-path consent and manifest readback.",
      label: "Manual Share Path",
      redactedEndpoint: "\\\\host\\share\\<game>",
      selectionPolicy: "Allowed only as existing local-path copy source.",
      status: "warning",
      transport: "User-provided SMB/NFS path",
    },
  ],
  consentOperation: "lan_peer_discovery_preflight_review",
  guards: [
    "No UDP broadcast is sent",
    "No relay request is executed",
    "No peer is auto-selected",
    "No share is mounted",
    "Candidate endpoints stay redacted",
  ],
  label: "Peer Discovery Preflight",
  rateLimit: "Max 3 candidate refreshes per 10 minutes before native rollout review.",
  status: "warning",
  summary:
    "Discovery is staged as a local no-network contract: supported discovery lanes, identity proof requirements, manual selection policy, endpoint redaction, and rate limits are reviewable before any native broadcaster or relay lookup is enabled.",
};

export function buildLanTransferNativeCopyReadiness(
  input: LanTransferNativeCopyReadinessInput,
): LanTransferNativeCopyReadiness {
  const gates: LanTransferNativeCopyGate[] = [
    {
      action: input.localPlannerReady
        ? "Keep peer-copy planning deterministic until native transfer services exist."
        : "Restore local LAN transfer planning before staging native copy work.",
      detail: input.localPlannerReady
        ? "The Downloads page can rank local peer-copy lanes from planner state."
        : "No local peer planner evidence exists for a native copy rollout.",
      id: "local-peer-planner",
      label: "Local Peer Planner",
      status: input.localPlannerReady ? "ready" : "blocked",
    },
    {
      action: input.pairingTrustReady
        ? "Keep paired-device evidence review-only until signed trust is staged."
        : "Define signed pairing, device identity, and revocation before copy starts.",
      detail: input.pairingTrustReady
        ? "Local pairing evidence exists, but trusted device handshakes remain disabled."
        : "No trusted pairing handshake or revocation evidence is staged.",
      id: "pairing-trust",
      label: "Pairing Trust",
      status: input.pairingTrustReady ? "warning" : "blocked",
    },
    {
      action: input.peerDiscoveryReady
        ? "Review discovery candidates without broadcast, relay calls, or automatic copy selection."
        : "Stage mDNS/relay discovery with consent, rate limits, and redacted logs.",
      detail: input.peerDiscoveryReady
        ? "Local peer-discovery preflight defines mDNS, relay, and manual-share candidate rules without network traffic."
        : "No real peer discovery, broadcast listener, or relay lookup is staged.",
      id: "peer-discovery",
      label: "Peer Discovery",
      status: input.peerDiscoveryReady ? "warning" : "blocked",
    },
    {
      action: input.nativeCopyEngineReady
        ? "Keep native copy behind preview review and explicit source-target consent."
        : "Add a native copy worker with scoped paths, progress, and failure states.",
      detail: input.nativeCopyEngineReady
        ? "Desktop can copy from a reachable source path into an empty target with scoped path checks."
        : "No native game-file copy worker is staged for LAN transfer.",
      id: "native-copy-engine",
      label: "Copy Engine",
      status: input.nativeCopyEngineReady ? "ready" : "blocked",
    },
    {
      action: input.resumeCancelReady
        ? "Keep cancel limited to local copy jobs and cleanup deletion limited to reviewed ledger candidates."
        : "Stage resumable manifests, partial-file cleanup, and cancel rollback.",
      detail: input.resumeCancelReady
        ? "Desktop can start cancellable local copy jobs, remove partial chunks on cancel before manifest write, resume a local copy, reject conflicts, and delete reviewed cleanup candidates after explicit consent."
        : "No native resume, cancel, or partial-transfer ledger is staged.",
      id: "resume-cancel",
      label: "Resume + Cancel",
      status: input.resumeCancelReady ? "ready" : "blocked",
    },
    {
      action: input.firewallPolicyReady
        ? "Review firewall prompts, scopes, and fallbacks without opening ports."
        : "Define firewall prompts, port policy, and platform-specific fallbacks.",
      detail: input.firewallPolicyReady
        ? "Firewall policy evidence exists for prompts, platform fallbacks, redacted probes, and no automatic rule writes."
        : "No firewall rule, port probe, or platform fallback is staged.",
      id: "firewall-policy",
      label: "Firewall Handling",
      status: input.firewallPolicyReady ? "warning" : "blocked",
    },
    {
      action: input.manifestVerificationReady
        ? "Keep copied-file hash checks coupled to manifest write completion."
        : "Wire copied-file manifest verification and repair before marking jobs done.",
      detail: input.manifestVerificationReady
        ? "Desktop copy hashes copied files and writes og-manifest.json after verification."
        : "No post-copy manifest verification or repair handoff is staged.",
      id: "post-copy-manifest",
      label: "Manifest Verification",
      status: input.manifestVerificationReady ? "ready" : "blocked",
    },
  ];
  const readyCount = gates.filter((gate) => gate.status === "ready").length;
  const warningCount = gates.filter((gate) => gate.status === "warning").length;
  const blockedCount = gates.filter((gate) => gate.status === "blocked").length;
  const nextGate =
    gates.find((gate) => gate.status === "blocked") ??
    gates.find((gate) => gate.status === "warning") ??
    null;

  return {
    blockedCount,
    firewallPolicyEvidence: input.firewallPolicyReady
      ? {
          ...LAN_TRANSFER_FIREWALL_POLICY_EVIDENCE,
          guards: [...LAN_TRANSFER_FIREWALL_POLICY_EVIDENCE.guards],
          platformRules: LAN_TRANSFER_FIREWALL_POLICY_EVIDENCE.platformRules.map((rule) => ({
            ...rule,
          })),
        }
      : null,
    gates,
    guardCopy: LAN_TRANSFER_NATIVE_COPY_GUARD_COPY,
    guards: [...LAN_TRANSFER_NATIVE_COPY_GUARDS],
    nextAction: nextGate?.action ?? "LAN Transfer native copy is ready for staged review.",
    peerDiscoveryPreflight: input.peerDiscoveryReady
      ? {
          ...LAN_TRANSFER_PEER_DISCOVERY_PREFLIGHT,
          candidates: LAN_TRANSFER_PEER_DISCOVERY_PREFLIGHT.candidates.map((candidate) => ({
            ...candidate,
          })),
          guards: [...LAN_TRANSFER_PEER_DISCOVERY_PREFLIGHT.guards],
        }
      : null,
    progress: Math.round((readyCount / gates.length) * 100),
    readyCount,
    statusLabel:
      blockedCount > 0 ? "Local only" : warningCount > 0 ? "Needs staging" : "Review ready",
    summary:
      blockedCount > 0
        ? "LAN native copy can prove local path copy, cancellable local copy jobs, resume-copy reuse, manifest hashes, reviewed cleanup deletion, peer-discovery preflight, and firewall policy evidence, but live peer broadcast, trusted pairing exchange, firewall rule changes, and mount remain open."
        : warningCount > 0
          ? "LAN native copy has local execution, peer-discovery preflight, and firewall policy evidence, but real peer-copy automation still needs review."
          : "LAN native-copy gates can enter controlled desktop review.",
    warningCount,
  };
}

export function createVerifyLanTransferNativeCopyReadiness(): LanTransferNativeCopyReadiness {
  return buildLanTransferNativeCopyReadiness({
    firewallPolicyReady: true,
    localPlannerReady: true,
    manifestVerificationReady: true,
    nativeCopyEngineReady: true,
    pairingTrustReady: true,
    peerDiscoveryReady: true,
    resumeCancelReady: true,
  });
}
