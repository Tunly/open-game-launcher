export const REMOTE_HOSTED_RELAY_VERIFY_MODE = "remote-hosted-contract-ready";

export function readRemoteHostedRelayDeploymentFlag(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

export function isRemoteHostedRelayDeploymentReady(
  verifyMode: string | null,
  envValue: unknown = import.meta.env.VITE_OG_REMOTE_HOSTED_RELAY_ENABLED,
) {
  return (
    verifyMode === REMOTE_HOSTED_RELAY_VERIFY_MODE || readRemoteHostedRelayDeploymentFlag(envValue)
  );
}

export function isRemoteHostedRelayEnqueueEnabled(
  envValue: unknown = import.meta.env.VITE_OG_REMOTE_HOSTED_RELAY_ENABLED,
) {
  return readRemoteHostedRelayDeploymentFlag(envValue);
}
