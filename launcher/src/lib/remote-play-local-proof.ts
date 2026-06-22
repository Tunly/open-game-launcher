export type RemotePlayLocalProofTone = "ready" | "review" | "blocked";

export interface RemotePlayLocalProofRow {
  detail: string;
  id: string;
  label: string;
  status: string;
  tone: RemotePlayLocalProofTone;
}

export function createRemotePlayLocalProofRows(): RemotePlayLocalProofRow[] {
  return [
    {
      detail: "Steam AppID 620 resolves to official desktop delegation without launching in tests.",
      id: "steam-appid",
      label: "Steam AppID",
      status: "READY",
      tone: "ready",
    },
    {
      detail:
        "Epic/EOS launcher URIs are reviewed as URI-only delegation, with no provider session or invite claim.",
      id: "epic-eos-uri",
      label: "Epic/EOS URI",
      status: "REVIEW",
      tone: "review",
    },
    {
      detail:
        "HTTPS cloud handoff is accepted only as a configured endpoint and does not claim live streaming success.",
      id: "https-cloud",
      label: "HTTPS Cloud",
      status: "READY",
      tone: "ready",
    },
    {
      detail:
        "Plain HTTP, JavaScript URIs, signed-token shaped handoffs, and unknown schemes stay blocked.",
      id: "unsafe-uri",
      label: "Unsafe URI",
      status: "BLOCKED",
      tone: "blocked",
    },
  ];
}
