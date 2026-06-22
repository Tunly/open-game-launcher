export type RemotePlayEpicEosProviderContractStatus = "blocked" | "pass" | "review";

export interface RemotePlayEpicEosProviderContractLane {
  detail: string;
  evidence: string;
  id: string;
  label: string;
  skipped: string;
  status: RemotePlayEpicEosProviderContractStatus;
  surface: string;
}

export interface RemotePlayEpicEosFixtureReplay {
  blockedClaim: string;
  decision: string;
  evidence: string;
  from: string;
  id: string;
  label: string;
  to: string;
}

export interface RemotePlayEpicEosProviderContract {
  blockedClaims: string[];
  blockedCount: number;
  createdAt: string;
  fixtureReplays: RemotePlayEpicEosFixtureReplay[];
  lanes: RemotePlayEpicEosProviderContractLane[];
  packetId: string;
  passCount: number;
  reviewCount: number;
  statusLabel: string;
  summary: string;
}

export const REMOTE_PLAY_EPIC_EOS_BLOCKED_CLAIMS = [
  "No Epic/EOS provider session proof",
  "No Epic/EOS invite delivery",
  "No Epic/EOS invite acceptance",
  "No provider token rendered",
  "No live streaming session proof",
  "No hosted remote deployment proof",
  "No Supabase desktop-device secret",
  "No provider client mutation",
] as const;

const REMOTE_PLAY_EPIC_EOS_FIXTURE_REPLAY_SOURCE: RemotePlayEpicEosFixtureReplay[] = [
  {
    blockedClaim: "No Epic/EOS provider session proof",
    decision: "label-only",
    evidence: "fixture-only transition replay: installed -> signed-in -> running -> current-title",
    from: "epic-installed",
    id: "session-state-replay",
    label: "Session State Replay",
    to: "epic-current-title",
  },
  {
    blockedClaim: "No Epic/EOS invite delivery",
    decision: "redact-and-hold",
    evidence:
      "fixture-only transition replay: target hash, namespace, room id, and ttl remain local",
    from: "invite-draft",
    id: "invite-envelope-transition",
    label: "Invite Envelope Transition",
    to: "local-envelope-review",
  },
  {
    blockedClaim: "No provider client mutation",
    decision: "allow-launcher-uri",
    evidence:
      "fixture-only transition replay: official Epic launcher URI allowed; http, javascript, and file schemes blocked",
    from: "provider-session-unavailable",
    id: "uri-fallback-decision",
    label: "URI Fallback Decision",
    to: "official-uri-fallback",
  },
  {
    blockedClaim: "No live streaming session proof",
    decision: "map-to-blocked-lane",
    evidence:
      "fixture-only transition replay: offline, auth-expired, unavailable, throttled, and provider errors stay blocked",
    from: "provider-error",
    id: "provider-error-mapping",
    label: "Provider Error Mapping",
    to: "no-live-proof",
  },
];

export function replayRemotePlayEpicEosProviderFixtures(): RemotePlayEpicEosFixtureReplay[] {
  return REMOTE_PLAY_EPIC_EOS_FIXTURE_REPLAY_SOURCE.map((replay) => ({ ...replay }));
}

export function createVerifyRemotePlayEpicEosProviderContract(): RemotePlayEpicEosProviderContract {
  const lanes: RemotePlayEpicEosProviderContractLane[] = [
    {
      detail:
        "Reviews Epic/EOS installed, signed-in, running, and current-title states as local labels only.",
      evidence: "states:installed|signed-in|running|current-title -> fixture labels",
      id: "provider-session-state",
      label: "Provider Session State",
      skipped: "No Epic/EOS client session API call",
      status: "blocked",
      surface: "Provider State",
    },
    {
      detail:
        "Stages invite target, product namespace, friend id, and room metadata as redacted local envelope fields.",
      evidence: "invite:target-hash+namespace+room-id+ttl+redaction",
      id: "invite-envelope",
      label: "Invite Envelope",
      skipped: "No Epic/EOS invite send or acceptance callback",
      status: "review",
      surface: "Invite Handoff",
    },
    {
      detail:
        "Allows only the official Epic launcher URI shape as fallback and keeps unsafe schemes rejected.",
      evidence: "uri:com.epicgames.launcher://apps/<catalog-id>?action=launch",
      id: "launch-uri-fallback",
      label: "Launch URI Fallback",
      skipped: "No provider session join or stream start",
      status: "pass",
      surface: "Launcher Fallback",
    },
    {
      detail:
        "Maps offline client, auth expired, title unavailable, invite throttled, and provider error states.",
      evidence: "errors:offline|auth-expired|title-unavailable|invite-throttled|provider-error",
      id: "provider-error-map",
      label: "Provider Error Map",
      skipped: "No live Epic/EOS error response",
      status: "review",
      surface: "Error State",
    },
    {
      detail:
        "Keeps streaming and remote session success out of scope until a live provider/hardware run exists.",
      evidence: "stream-proof:external-artifact-required",
      id: "stream-success-proof",
      label: "Streaming Proof",
      skipped: "No live stream, peer session, or remote-control proof",
      status: "blocked",
      surface: "Live Proof",
    },
  ];
  const fixtureReplays = replayRemotePlayEpicEosProviderFixtures();
  const passCount = lanes.filter((lane) => lane.status === "pass").length;
  const reviewCount = lanes.filter((lane) => lane.status === "review").length;
  const blockedCount = lanes.filter((lane) => lane.status === "blocked").length;

  return {
    blockedClaims: [...REMOTE_PLAY_EPIC_EOS_BLOCKED_CLAIMS],
    blockedCount,
    createdAt: "2026-06-16T00:00:00.000Z",
    fixtureReplays,
    lanes,
    packetId: "remote-play-epic-eos-provider-contract-local-001",
    passCount,
    reviewCount,
    statusLabel: "Provider Proof Required",
    summary:
      "Local Epic/EOS Remote Play provider-state contract for session labels, invite envelope shape, URI fallback, error mapping, and fixture-only transition replay. It does not contact Epic/EOS, send invites, join sessions, mutate provider clients, or claim live streaming success.",
  };
}
