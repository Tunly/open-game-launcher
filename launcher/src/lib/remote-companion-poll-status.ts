import type { runRemoteCompanionInstallJobPollOnce } from "./remote-companion-auto-poll";

export type RemoteCompanionPollMode = "auto" | "manual";

export interface RemoteCompanionPollUiState {
  detail: string;
  label: string;
  tone: "failed" | "idle" | "ready" | "warning";
}

type RemoteCompanionPollResult = Awaited<ReturnType<typeof runRemoteCompanionInstallJobPollOnce>>;
const REMOTE_COMPANION_POLL_MESSAGE_MAX_LENGTH = 180;
const SECRET_FIELD_PATTERN = String.raw`(?:access[_-]?token|refresh[_-]?token|companion[_-]?token|device[_-]?secret|api[_-]?key|signed[_-]?url|package[_-]?url|jwt|token|sig|signature|secret|key)`;
const AUTHORIZATION_BEARER_PATTERN = /\b(authorization\s*:\s*bearer)\s+([^\s,;"}]+)/gi;
const AUTHORIZATION_ASSIGNMENT_PATTERN = /\b(authorization)\s*=\s*([^\s&,;)}\]]+)/gi;
const SECRET_ASSIGNMENT_PATTERN = new RegExp(
  String.raw`\b(${SECRET_FIELD_PATTERN})\s*=\s*([^\s&,;)}\]]+)`,
  "gi",
);
const SECRET_QUOTED_COLON_PATTERN = new RegExp(
  String.raw`(["']?${SECRET_FIELD_PATTERN}["']?\s*:\s*["'])([^"']+)(["'])`,
  "gi",
);
const SECRET_COLON_PATTERN = new RegExp(
  String.raw`\b(${SECRET_FIELD_PATTERN})\s*:\s*([^\s,;)}\]]+)`,
  "gi",
);
const LINK_PATTERN = /\b(?:(?:https?|wss?):\/\/|oglauncher:\/\/)[^\s<>"')]+/gi;
const BARE_RELAY_HOST_PATTERN = /\brelay\.og-launcher\.test\/[^\s<>"')]+/gi;

export const REMOTE_COMPANION_POLL_IDLE: RemoteCompanionPollUiState = {
  detail: "No relay claim checked this session.",
  label: "Idle",
  tone: "idle",
};

export function buildRemoteCompanionPollStatus(
  result: RemoteCompanionPollResult,
  mode: RemoteCompanionPollMode = "manual",
): RemoteCompanionPollUiState {
  if (!result.configured) {
    return {
      detail:
        mode === "auto"
          ? "Always-On is waiting for the desktop vault or cached session."
          : "Desktop vault or cached session is missing.",
      label: mode === "auto" ? "Auto wait" : "Not ready",
      tone: "warning",
    };
  }

  const firstMessage = sanitizeRemoteCompanionPollMessage(
    result.jobs[0]?.message ?? "No hosted jobs were claimed.",
  );
  if (result.started > 0) {
    return {
      detail: mode === "auto" ? `Always-On claimed jobs: ${firstMessage}` : firstMessage,
      label: `${result.started} started`,
      tone: "ready",
    };
  }

  if (result.failed > 0) {
    return {
      detail: mode === "auto" ? `Always-On claim failed: ${firstMessage}` : firstMessage,
      label: `${result.failed} failed`,
      tone: "failed",
    };
  }

  return {
    detail:
      mode === "auto"
        ? "Always-On checked relay; no hosted jobs were claimed."
        : "No hosted jobs were claimed.",
    label: mode === "auto" ? "Auto idle" : "No jobs",
    tone: "idle",
  };
}

export function sanitizeRemoteCompanionPollMessage(message: string): string {
  const collapsed = message.replace(/\s+/g, " ").trim();
  if (!collapsed) return "Relay job message redacted.";

  const redacted = collapsed
    .replace(AUTHORIZATION_BEARER_PATTERN, (_match, prefix: string) => {
      return `${prefix} [secret-redacted]`;
    })
    .replace(AUTHORIZATION_ASSIGNMENT_PATTERN, (_match, key: string) => {
      return `${key.toLowerCase()}=[secret-redacted]`;
    })
    .replace(SECRET_ASSIGNMENT_PATTERN, (_match, key: string) => {
      return `${key.toLowerCase()}=[secret-redacted]`;
    })
    .replace(
      SECRET_QUOTED_COLON_PATTERN,
      (_match, prefix: string, _secret: string, suffix: string) => {
        return `${prefix}[secret-redacted]${suffix}`;
      },
    )
    .replace(SECRET_COLON_PATTERN, (_match, key: string) => {
      return `${key}: [secret-redacted]`;
    })
    .replace(LINK_PATTERN, "[link-redacted]")
    .replace(BARE_RELAY_HOST_PATTERN, "[link-redacted]")
    .trim();

  if (!redacted) return "Relay job message redacted.";
  if (redacted.length <= REMOTE_COMPANION_POLL_MESSAGE_MAX_LENGTH) return redacted;

  return `${redacted.slice(0, REMOTE_COMPANION_POLL_MESSAGE_MAX_LENGTH - 3).trimEnd()}...`;
}
