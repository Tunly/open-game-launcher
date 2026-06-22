export type MobileAppReadinessStatus = "blocked" | "ready" | "warning";

export interface MobileAppReadinessInput {
  appStoreDistributionReady: boolean;
  chatRelayReady: boolean;
  devicePairingReady: boolean;
  hostedRelayReady: boolean;
  librarySyncReady: boolean;
  pushProviderReady: boolean;
  remoteDownloadsReady: boolean;
}

export interface MobileAppReadinessGate {
  action: string;
  detail: string;
  id: string;
  label: string;
  status: MobileAppReadinessStatus;
}

export interface MobileAppReadiness {
  blockedCount: number;
  gates: MobileAppReadinessGate[];
  guardCopy: string;
  guards: string[];
  nextAction: string;
  progress: number;
  readyCount: number;
  statusLabel: string;
  summary: string;
  warningCount: number;
}

const LOCAL_ONLY_GUARDS = [
  "No native iOS/Android app",
  "No push notification send",
  "No app-store distribution",
  "No background mobile download",
  "No live hosted deployment",
];

const LOCAL_ONLY_GUARD_COPY =
  "Local mobile readiness only. This panel reviews companion gates from launcher state; it does not ship an iOS/Android app, send push notifications, run mobile background downloads, prove app-store distribution, or prove a live hosted deployment.";

export function buildMobileAppReadiness(input: MobileAppReadinessInput): MobileAppReadiness {
  const gates: MobileAppReadinessGate[] = [
    {
      action: input.devicePairingReady
        ? "Keep pairing QR/code flows redacted and one-time."
        : "Finish mobile/desktop device pairing before app handoff.",
      detail: input.devicePairingReady
        ? "Companion pairing contract exists for desktop-device registration."
        : "No mobile companion device pairing evidence is staged.",
      id: "device-pairing",
      label: "Device Pairing",
      status: input.devicePairingReady ? "ready" : "blocked",
    },
    {
      action: input.librarySyncReady
        ? "Expose only sanitized library metadata to mobile surfaces."
        : "Stage local library snapshot sync for mobile read-only browsing.",
      detail: input.librarySyncReady
        ? "Library snapshot/local entity sync can back a mobile browse view."
        : "Mobile library browse needs a scoped read model.",
      id: "library-sync",
      label: "Library Sync",
      status: input.librarySyncReady ? "ready" : "warning",
    },
    {
      action: input.chatRelayReady
        ? "Review realtime chat permissions before exposing mobile chat."
        : "Add a mobile-safe chat relay and notification permission plan.",
      detail: input.chatRelayReady
        ? "Existing chat/realtime data can be reviewed for mobile relay scope."
        : "Mobile chat relay, moderation, and auth refresh are not staged.",
      id: "chat-relay",
      label: "Chat Relay",
      status: input.chatRelayReady ? "warning" : "blocked",
    },
    {
      action: input.remoteDownloadsReady
        ? "Keep mobile actions as opaque install jobs only."
        : "Complete opaque remote-download enqueue and claim gates.",
      detail: input.remoteDownloadsReady
        ? "Remote downloads can use opaque jobs without package URLs on mobile."
        : "Mobile remote downloads need opaque queue and desktop claim coverage.",
      id: "remote-downloads",
      label: "Remote Downloads",
      status: input.remoteDownloadsReady ? "ready" : "blocked",
    },
    {
      action: input.pushProviderReady
        ? "Keep token-hash registration contract staged while APNs/FCM send stays disabled."
        : "Choose APNs/FCM provider, consent model, and token storage first.",
      detail: input.pushProviderReady
        ? "Mobile push token-hash registration contract is staged for consent, owner scope, and unregister review; APNs/FCM send remains disabled."
        : "No APNs/FCM credentials, device-token table, or push consent path is staged.",
      id: "push-provider",
      label: "Push Provider",
      status: input.pushProviderReady ? "warning" : "blocked",
    },
    {
      action: input.hostedRelayReady
        ? "Verify hosted relay with production secrets before mobile launch."
        : "Deploy hosted relay before mobile clients can reach desktop devices.",
      detail: input.hostedRelayReady
        ? "Hosted relay evidence exists for companion API calls."
        : "Hosted production relay is still unverified.",
      id: "hosted-relay",
      label: "Hosted Relay",
      status: input.hostedRelayReady ? "warning" : "blocked",
    },
    {
      action: input.appStoreDistributionReady
        ? "Keep release notarization and review notes attached to the mobile track."
        : "Define iOS/Android signing, review, and distribution before release.",
      detail: input.appStoreDistributionReady
        ? "Distribution evidence is staged, but production release still needs review."
        : "No TestFlight/Play track, app signing, or store review evidence exists.",
      id: "app-store",
      label: "App Store",
      status: input.appStoreDistributionReady ? "warning" : "blocked",
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
    gates,
    guardCopy: LOCAL_ONLY_GUARD_COPY,
    guards: [...LOCAL_ONLY_GUARDS],
    nextAction: nextGate?.action ?? "Mobile app readiness gates are ready for staged review.",
    progress: Math.round((readyCount / gates.length) * 100),
    readyCount,
    statusLabel:
      blockedCount > 0 ? "Local only" : warningCount > 0 ? "Needs staging" : "Review ready",
    summary:
      blockedCount > 0
        ? "Mobile App is still a local readiness map; native app, push, and production relay remain open."
        : warningCount > 0
          ? "Mobile App has companion evidence, but production mobile staging remains open."
          : "Mobile App readiness gates can enter a staged mobile review.",
    warningCount,
  };
}

export function createVerifyMobileAppReadiness(): MobileAppReadiness {
  return buildMobileAppReadiness({
    appStoreDistributionReady: false,
    chatRelayReady: true,
    devicePairingReady: true,
    hostedRelayReady: false,
    librarySyncReady: true,
    pushProviderReady: true,
    remoteDownloadsReady: true,
  });
}
