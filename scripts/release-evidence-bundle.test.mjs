import assert from "node:assert/strict";
import test from "node:test";

import { parseArgs, releaseEvidenceBundle } from "./release-evidence-bundle.mjs";

const fakeSecretEnv = Object.freeze({
  ACCOUNT_DELETION_PROCESSOR_SECRET:
    "account_deletion_0123456789abcdef0123456789",
  OGL_EXTERNAL_EVIDENCE_GATES: "hardware-os-e2e",
  PRESENCE_POLL_SECRET: "presence_poll_0123456789abcdef0123456789",
  PRICE_DROP_NOTIFY_SECRET: "price_drop_0123456789abcdef0123456789",
  STEAM_WEB_API_KEY: "steam_0123456789abcdef",
  SUPABASE_ACCESS_TOKEN: "sbp_0123456789abcdef0123456789abcdef",
  SUPABASE_ANON_KEY: "anon_0123456789abcdef",
  SUPABASE_AUTH_JWT: "bearer.jwt.payload",
  SUPABASE_FUNCTIONS_URL: "https://awebfvfyqzwapcgixdfj.supabase.co/functions/v1",
  SUPABASE_PROJECT_REF: "awebfvfyqzwapcgixdfj",
  SUPABASE_SERVICE_ROLE_KEY: "service_role_0123456789abcdef",
  SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co",
});

test("parseArgs accepts an optional release tag", () => {
  assert.deepEqual(parseArgs([]), { tag: undefined });
  assert.deepEqual(parseArgs(["v1.2.3"]), { tag: "v1.2.3" });
  assert.throws(() => parseArgs(["v1.2.3", "extra"]), /Usage:/);
});

test("release evidence bundle combines local and external operator handoffs", () => {
  const output = releaseEvidenceBundle({
    env: {},
    now: new Date("2026-06-22T10:00:00.000Z"),
    tag: "v0.1.0",
  });

  assert.match(output, /^Release evidence operator bundle/);
  assert.match(output, /## 1\. Release Candidate Preflight/);
  assert.match(output, /## 2\. Completion Gate Status Summary/);
  assert.match(output, /## 3\. External Evidence Next Steps/);
  assert.match(output, /## 4\. External Evidence Artifact Worklist/);
  assert.match(output, /## 5\. External Evidence Operator Packet/);
  assert.match(output, /## 6\. External Evidence Operator Runbook/);
  assert.match(output, /## 7\. Hosted Deploy Gate Operator Packet/);
  assert.match(output, /## 8\. Hosted Scheduler Packet/);
  assert.match(output, /## 9\. Hosted Cron Evidence Packet/);
  assert.match(output, /## 10\. Final Release Boundary/);
  assert.match(output, /does not print environment values/);
  assert.match(output, /pnpm completion:gate/);
});

test("release evidence bundle does not print raw environment values", () => {
  const output = releaseEvidenceBundle({
    env: fakeSecretEnv,
    now: new Date("2026-06-22T10:00:00.000Z"),
    tag: "v0.1.0",
  });

  for (const value of Object.values(fakeSecretEnv)) {
    if (value === "hardware-os-e2e" || value === "awebfvfyqzwapcgixdfj") {
      continue;
    }
    assert.equal(
      output.includes(value),
      false,
      `Bundle leaked raw env value ${value}`,
    );
  }
  assert.match(output, /Authorization: Bearer \$PRICE_DROP_NOTIFY_SECRET/);
  assert.match(output, /Selected gates: 1/);
  assert.match(output, /Hardware and OS E2E \(hardware-os-e2e\)/);
});
