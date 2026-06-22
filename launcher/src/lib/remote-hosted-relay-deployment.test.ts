import { describe, expect, it } from "vitest";

import {
  isRemoteHostedRelayEnqueueEnabled,
  isRemoteHostedRelayDeploymentReady,
  readRemoteHostedRelayDeploymentFlag,
  REMOTE_HOSTED_RELAY_VERIFY_MODE,
} from "./remote-hosted-relay-deployment";

describe("remote hosted relay deployment gate", () => {
  it("accepts explicit true-like env flags only", () => {
    for (const value of ["1", "true", "TRUE", "yes", "on", " on "]) {
      expect(readRemoteHostedRelayDeploymentFlag(value)).toBe(true);
    }

    for (const value of ["0", "false", "no", "off", "", "enabled", undefined, true]) {
      expect(readRemoteHostedRelayDeploymentFlag(value)).toBe(false);
    }
  });

  it("keeps verify route as a deterministic hosted deployment override", () => {
    expect(isRemoteHostedRelayDeploymentReady(REMOTE_HOSTED_RELAY_VERIFY_MODE, "false")).toBe(true);
    expect(isRemoteHostedRelayDeploymentReady(null, "true")).toBe(true);
    expect(isRemoteHostedRelayDeploymentReady(null, "false")).toBe(false);
  });

  it("keeps hosted relay enqueue gated by the deployment flag only", () => {
    expect(isRemoteHostedRelayEnqueueEnabled("true")).toBe(true);
    expect(isRemoteHostedRelayEnqueueEnabled("false")).toBe(false);
  });
});
