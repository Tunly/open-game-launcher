import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  accountDeletionStorageBucketCountFromContract,
  accountDeletionStorageBucketCountFromContractSource,
  artifactHintsFromResults,
  buildLatestScheduledRunUrl,
  collectCronEvidence,
  cronEvidenceChecks,
  deriveRestBaseUrl,
  expectedAccountDeletionStorageBucketCount,
  fetchLatestScheduledRun,
  hostedCronEvidencePacket,
  missingRequiredEnv,
  parseArgs,
  planSummary,
  selectedCronEvidenceChecks,
  summarizeRun,
} from "./hosted-cron-evidence.mjs";

const runbook = readFileSync(
  new URL("../docs/runbooks/hosted-cron-evidence.md", import.meta.url),
  "utf8",
);
const functionsEnvExample = readFileSync(
  new URL("../supabase/functions/.env.example", import.meta.url),
  "utf8",
);
const evidenceScriptPath = fileURLToPath(
  new URL("./hosted-cron-evidence.mjs", import.meta.url),
);
const migrationsDir = new URL("../supabase/migrations/", import.meta.url);

const projectRef = "awebfvfyqzwapcgixdfj";
const otherProjectRef = "bbbbbbbbbbbbbbbbbbbb";
const supabaseUrl = `https://${projectRef}.supabase.co`;
const otherSupabaseUrl = `https://${otherProjectRef}.supabase.co`;

function jwtJsonPart(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function syntheticSupabaseJwt(payload) {
  return [
    jwtJsonPart({ alg: "HS256", typ: "JWT" }),
    jwtJsonPart({
      exp: 2_082_758_400,
      iat: 1_780_000_000,
      iss: "supabase",
      ref: projectRef,
      ...payload,
    }),
    Buffer.from("synthetic-hosted-cron-evidence-signature").toString(
      "base64url",
    ),
  ].join(".");
}

const serviceRoleJwt = syntheticSupabaseJwt({ role: "service_role" });
const otherServiceRoleJwt = syntheticSupabaseJwt({
  ref: otherProjectRef,
  role: "service_role",
});
const anonJwt = syntheticSupabaseJwt({ role: "anon" });
const otherAnonJwt = syntheticSupabaseJwt({
  ref: otherProjectRef,
  role: "anon",
});
const authJwt = syntheticSupabaseJwt({
  aud: "authenticated",
  iss: `${supabaseUrl}/auth/v1`,
  role: "authenticated",
  sub: "00000000-0000-4000-8000-000000000001",
});
const otherAuthJwt = syntheticSupabaseJwt({
  aud: "authenticated",
  iss: `${otherSupabaseUrl}/auth/v1`,
  ref: otherProjectRef,
  role: "authenticated",
  sub: "00000000-0000-4000-8000-000000000002",
});

const env = {
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleJwt,
  SUPABASE_URL: `${supabaseUrl}/`,
};

function allMigrationSql() {
  return readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .map((fileName) => readFileSync(new URL(fileName, migrationsDir), "utf8"))
    .join("\n");
}

function summaryDefaults(check) {
  if (check.id === "price-drop") {
    return {
      skipped_summary: {
        already_notified: 0,
        inactive: 0,
        invalid_product: 0,
        invalid_target: 0,
        not_met: 0,
        unpublished_product: 0,
      },
    };
  }
  if (check.id === "presence-poll") {
    return {
      provider_result_summary: {
        byPlatform: {},
        byStatus: {},
        total: 0,
      },
      skipped_summary: {
        byPlatform: {},
        byReason: {},
        maxRetryAfterSeconds: 0,
        rateLimited: 0,
        total: 0,
      },
    };
  }
  if (check.id === "account-deletion") {
    return {
      skipped_summary: {},
      storage_bucket_count: expectedAccountDeletionStorageBucketCount,
    };
  }
  return {};
}

function completedRow(check, overrides = {}) {
  const counts = Object.fromEntries(
    check.select.filter((key) => key.endsWith("_count")).map((key) => [key, 0]),
  );
  return {
    ...counts,
    ...summaryDefaults(check),
    completed_at: "2026-06-16T10:00:00.000Z",
    dry_run: false,
    run_id: `${check.id}-run`,
    status: "completed",
    trigger_source: "scheduled",
    ...overrides,
  };
}

test("hosted cron evidence migrations index latest completed scheduled runs", () => {
  const migrations = allMigrationSql();

  for (const [tableName, indexName] of [
    [
      "store_price_drop_notification_runs",
      "store_price_drop_notification_runs_trigger_completed_at_idx",
    ],
    ["presence_poll_runs", "presence_poll_runs_trigger_source_completed_at_idx"],
    [
      "account_deletion_processor_runs",
      "account_deletion_processor_runs_trigger_completed_at_idx",
    ],
  ]) {
    assert.match(
      migrations,
      new RegExp(
        `create index if not exists ${indexName}\\s+on public\\.${tableName}\\s*\\(trigger_source, completed_at desc\\)`,
        "i",
      ),
    );
  }
});

test("parseArgs accepts plan, check, artifact-hints, and packet only", () => {
  assert.deepEqual(parseArgs([]), { action: "check", checks: "" });
  assert.deepEqual(parseArgs(["plan"]), { action: "plan", checks: "" });
  assert.deepEqual(parseArgs(["artifact-hints"]), {
    action: "artifact-hints",
    checks: "",
  });
  assert.deepEqual(parseArgs(["packet"]), { action: "packet", checks: "" });
  assert.deepEqual(parseArgs(["check", "--checks=price-drop"]), {
    action: "check",
    checks: "price-drop",
  });
  assert.deepEqual(
    parseArgs(["packet", "--checks", "price-drop,presence-poll"]),
    {
      action: "packet",
      checks: "price-drop,presence-poll",
    },
  );
  assert.deepEqual(parseArgs(["--checks", "price-drop"]), {
    action: "check",
    checks: "price-drop",
  });
  assert.deepEqual(parseArgs(["--checks", "price-drop", "packet"]), {
    action: "packet",
    checks: "price-drop",
  });
  assert.throws(
    () => parseArgs(["check", "--checks"]),
    (error) => {
      assert.match(error.message, /Missing hosted cron evidence check list/);
      return true;
    },
  );
  assert.throws(
    () => parseArgs(["deploy"]),
    (error) => {
      assert.match(error.message, /Unknown hosted cron evidence action/);
      assert.equal(error.message.includes("deploy"), false);
      return true;
    },
  );
  assert.throws(
    () => selectedCronEvidenceChecks({ OGL_HOSTED_CRON_EVIDENCE_CHECKS: "," }),
    (error) => {
      assert.match(error.message, /OGL_HOSTED_CRON_EVIDENCE_CHECKS/);
      assert.match(error.message, /at least one check/);
      return true;
    },
  );
});

test("selectedCronEvidenceChecks filters checks without echoing unknown input", () => {
  assert.deepEqual(
    selectedCronEvidenceChecks({
      OGL_HOSTED_CRON_EVIDENCE_CHECKS: "price-drop,presence-poll",
    }).map((check) => check.id),
    ["price-drop", "presence-poll"],
  );
  assert.deepEqual(
    selectedCronEvidenceChecks({}, "account-deletion").map((check) => check.id),
    ["account-deletion"],
  );
  assert.throws(
    () => selectedCronEvidenceChecks({}, ","),
    (error) => {
      assert.match(error.message, /at least one check/);
      return true;
    },
  );
  assert.throws(
    () =>
      selectedCronEvidenceChecks({
        OGL_HOSTED_CRON_EVIDENCE_CHECKS: "sk_live_should_not_echo_123456",
      }),
    (error) => {
      assert.match(error.message, /Unknown hosted cron evidence check/);
      assert.equal(error.message.includes("sk_live_should_not_echo"), false);
      return true;
    },
  );
});

test("hostedCronEvidencePacket summarizes ready rows without completing proof rows", () => {
  const results = cronEvidenceChecks.map((check) =>
    summarizeRun(
      check,
      completedRow(check, { run_id: `${check.id}-scheduled-20260616` }),
      new Date("2026-06-16T10:30:00.000Z"),
      60 * 60 * 1000,
    ),
  );
  const output = hostedCronEvidencePacket(
    results,
    env,
    new Date("2026-06-16T10:31:00.000Z"),
  );

  assert.match(output, /Hosted cron evidence operator packet/);
  assert.match(output, /Generated at: 2026-06-16T10:31:00.000Z/);
  assert.match(
    output,
    /Selected checks: price-drop; presence-poll; account-deletion/,
  );
  assert.match(output, /Ready rows: 3\/3/);
  assert.match(
    output,
    /rows validate; scheduler dashboard\/config proof still required/,
  );
  assert.match(output, /Hosted cron artifact handoff hints/);
  assert.match(output, /price-drop-scheduled-20260616/);
  assert.match(output, /- dry_run=false: confirmed false/);
  assert.equal(/-\s+\[[xX]\]/.test(output), false);
  assert.equal(output.includes(env.SUPABASE_URL), false);
  assert.equal(output.includes(env.SUPABASE_SERVICE_ROLE_KEY), false);
  assert.equal(output.includes(`Bearer ${serviceRoleJwt}`), false);
});

test("hostedCronEvidencePacket reports missing env and incomplete rows without raw details", () => {
  const output = hostedCronEvidencePacket(
    [
      {
        counts: {},
        id: "price-drop",
        ready: false,
        runId: "sk_live_should_not_echo_1234567890",
        table: "store_price_drop_notification_runs",
        validationErrors: ["sk_live_should_not_echo_1234567890"],
      },
      {
        counts: { scanned: 1 },
        id: "presence-poll",
        ready: true,
        runId: "presence-poll-scheduled-20260616",
        table: "presence_poll_runs",
        validationErrors: [],
      },
    ],
    {
      SUPABASE_SERVICE_ROLE_KEY: "set",
      SUPABASE_URL: "placeholder",
    },
    new Date("2026-06-16T10:31:00.000Z"),
  );

  assert.match(output, /Ready rows: 1\/3/);
  assert.match(
    output,
    /REST base URL: \(set SUPABASE_REST_URL or SUPABASE_URL or SUPABASE_PROJECT_REF\)/,
  );
  assert.doesNotMatch(output, /REST base URL: \(set SUPABASE_URL\)/);
  assert.match(
    output,
    /Missing env names: SUPABASE_REST_URL or SUPABASE_URL or SUPABASE_PROJECT_REF/,
  );
  assert.match(
    output,
    /Artifact hints unavailable until every selected scheduled non-dry-run row validates/,
  );
  assert.match(output, /Validation errors: \[redacted\]/);
  assert.match(output, /Collection blocked: missing hosted cron evidence env/);
  assert.doesNotMatch(output, /Validation errors: none/);
  assert.equal(output.includes("sk_live_should_not_echo"), false);
  assert.equal(output.includes("placeholder"), false);
  assert.equal(/-\s+\[[xX]\]/.test(output), false);
  for (const name of [
    "SUPABASE_REST_URL",
    "SUPABASE_AUTH_JWT",
    "OGL_HOSTED_CRON_EVIDENCE_CHECKS",
  ]) {
    assert.match(functionsEnvExample, new RegExp(`^${name}=`, "m"));
  }
  const hostedCronEnvExample = functionsEnvExample.match(
    /# --- Hosted cron evidence collector[\s\S]*# --- External completion evidence preflight/,
  )?.[0];
  assert.ok(hostedCronEnvExample);
  assert.match(hostedCronEnvExample, /^SUPABASE_AUTH_JWT=/m);
  assert.match(hostedCronEnvExample, /authenticated caller JWT/i);
});

test("functions env example leaves global hosted cron freshness override disabled", () => {
  const hostedCronEnvExample = functionsEnvExample.match(
    /# --- Hosted cron evidence collector[\s\S]*# --- External completion evidence preflight/,
  )?.[0];
  assert.ok(hostedCronEnvExample);
  assert.doesNotMatch(
    hostedCronEnvExample,
    /^OGL_HOSTED_CRON_FRESHNESS_HOURS=/m,
  );
  assert.match(hostedCronEnvExample, /^# OGL_HOSTED_CRON_FRESHNESS_HOURS=/m);
});

test("hostedCronEvidencePacket and artifact hints can focus one cron lane", () => {
  const priceDropCheck = cronEvidenceChecks.find(
    (check) => check.id === "price-drop",
  );
  assert.ok(priceDropCheck);
  const result = summarizeRun(
    priceDropCheck,
    completedRow(priceDropCheck, { run_id: "price-drop-scheduled-20260616" }),
    new Date("2026-06-16T10:30:00.000Z"),
    60 * 60 * 1000,
  );

  const packet = hostedCronEvidencePacket(
    [result],
    env,
    new Date("2026-06-16T10:31:00.000Z"),
    [priceDropCheck],
  );
  const hints = artifactHintsFromResults([result], [priceDropCheck]);

  assert.match(packet, /Selected checks: price-drop/);
  assert.match(packet, /Ready rows: 1\/1/);
  assert.match(
    packet,
    /rows validate; scheduler dashboard\/config proof still required/,
  );
  assert.match(packet, /External Artifact Paste Targets/);
  assert.match(
    packet,
    /docs\/verification\/external\/store-price-drop-scheduler-live\.md/,
  );
  assert.match(packet, /Gate-Specific Evidence/);
  assert.match(
    packet,
    /matching `OGL_EXTERNAL_EVIDENCE_GATES=store-stripe-live pnpm external:evidence:preflight` command/,
  );
  assert.doesNotMatch(
    packet,
    /OGL_EXTERNAL_EVIDENCE_GATES=hosted-supabase-cron/,
  );
  assert.doesNotMatch(packet, /### presence-poll/);
  assert.doesNotMatch(packet, /### account-deletion/);
  assert.match(hints, /store_price_drop_notification_runs/);
  assert.doesNotMatch(hints, /### price-drop/);
  assert.doesNotMatch(hints, /presence_poll_runs/);
  assert.doesNotMatch(hints, /account_deletion_processor_runs/);
});

test("hostedCronEvidencePacket maps full cron lane packets to the hosted cron external gate", () => {
  const results = cronEvidenceChecks.map((check) =>
    summarizeRun(
      check,
      completedRow(check, { run_id: `${check.id}-scheduled-20260616` }),
      new Date("2026-06-16T10:30:00.000Z"),
      60 * 60 * 1000,
    ),
  );

  const packet = hostedCronEvidencePacket(
    results,
    env,
    new Date("2026-06-16T10:31:00.000Z"),
    cronEvidenceChecks,
  );

  assert.match(
    packet,
    /Selected checks: price-drop; presence-poll; account-deletion/,
  );
  assert.match(packet, /Ready rows: 3\/3/);
  assert.match(packet, /External Artifact Paste Targets/);
  assert.match(
    packet,
    /docs\/verification\/external\/hosted-supabase-cron\.md/,
  );
  assert.match(packet, /`### price-drop`/);
  assert.match(packet, /`### presence-poll`/);
  assert.match(packet, /`### account-deletion`/);
  assert.match(
    packet,
    /matching `OGL_EXTERNAL_EVIDENCE_GATES=hosted-supabase-cron pnpm external:evidence:preflight` command/,
  );
  assert.doesNotMatch(packet, /OGL_EXTERNAL_EVIDENCE_GATES=\.\.\./);
});

test("hostedCronEvidencePacket maps full cron lane packets independent of selection order", () => {
  const selectedChecks = [
    cronEvidenceChecks.find((check) => check.id === "presence-poll"),
    cronEvidenceChecks.find((check) => check.id === "price-drop"),
    cronEvidenceChecks.find((check) => check.id === "account-deletion"),
  ];
  const results = selectedChecks.map((check) =>
    summarizeRun(
      check,
      completedRow(check, { run_id: `${check.id}-scheduled-20260616` }),
      new Date("2026-06-16T10:30:00.000Z"),
      60 * 60 * 1000,
    ),
  );

  const packet = hostedCronEvidencePacket(
    results,
    env,
    new Date("2026-06-16T10:31:00.000Z"),
    selectedChecks,
  );

  assert.match(
    packet,
    /Selected checks: presence-poll; price-drop; account-deletion/,
  );
  assert.match(
    packet,
    /matching `OGL_EXTERNAL_EVIDENCE_GATES=hosted-supabase-cron pnpm external:evidence:preflight` command/,
  );
  assert.doesNotMatch(packet, /OGL_EXTERNAL_EVIDENCE_GATES=\.\.\./);
});

test("artifactHintsFromResults prepares redacted artifact fields without proof checkboxes", () => {
  const results = cronEvidenceChecks.map((check) =>
    summarizeRun(
      check,
      completedRow(check, { run_id: `${check.id}-scheduled-20260616` }),
      new Date("2026-06-16T10:30:00.000Z"),
      60 * 60 * 1000,
    ),
  );

  assert.equal(
    results.every((result) => result.ready),
    true,
  );

  const output = artifactHintsFromResults(results);

  for (const field of [
    "Hosted cron table",
    "Function",
    "Run ID",
    "Scheduled",
    "dry_run=false",
    "Status",
  ]) {
    assert.match(output, new RegExp(`- ${field}:`));
  }
  assert.match(output, /store_price_drop_notification_runs/);
  assert.match(output, /notify-price-drop/);
  assert.match(output, /presence_poll_runs/);
  assert.match(output, /poll-platform-presence/);
  assert.match(output, /account_deletion_processor_runs/);
  assert.match(output, /process-account-deletions/);
  assert.match(output, /price-drop-scheduled-20260616/);
  assert.match(output, /- Scheduled: scheduled/);
  assert.match(output, /- dry_run=false: confirmed false/);
  assert.match(output, /- Status: completed/);
  assert.equal(/-\s+\[[xX]\]/.test(output), false);
  assert.equal(/https?:\/\//.test(output), false);
  assert.equal(/SUPABASE_|SECRET|TOKEN|JWT|Bearer/i.test(output), false);
});

test("artifactHintsFromResults refuses incomplete evidence without echoing details", () => {
  assert.throws(
    () =>
      artifactHintsFromResults([
        {
          id: "price-drop",
          ready: false,
          runId: "[redacted-invalid-run-id]",
          table: "store_price_drop_notification_runs",
          validationErrors: ["sk_live_should_not_echo_1234567890"],
        },
      ]),
    (error) => {
      assert.match(error.message, /Hosted cron evidence is incomplete/);
      assert.equal(error.message.includes("sk_live_should_not_echo"), false);
      return true;
    },
  );
});

test("artifact-hints CLI prints paste-clean details without the generic plan", () => {
  const priceDrop = cronEvidenceChecks.find(
    (check) => check.id === "price-drop",
  );
  const row = completedRow(priceDrop, {
    run_id: "price-drop-cli-scheduled",
  });
  const fetchMockModule = `
    const row = ${JSON.stringify(row)};
    globalThis.fetch = async () => {
      row.completed_at = new Date(Date.now() - 60_000).toISOString();
      return new Response(JSON.stringify([row]), { status: 200 });
    };
  `;
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      `data:text/javascript,${encodeURIComponent(fetchMockModule)}`,
      evidenceScriptPath,
      "artifact-hints",
      "--checks=price-drop",
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        OGL_HOSTED_CRON_FRESHNESS_HOURS: "3",
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleJwt,
        SUPABASE_URL: supabaseUrl,
      },
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /^Hosted cron artifact handoff hints/);
  assert.doesNotMatch(result.stdout, /Hosted cron evidence plan/);
  assert.doesNotMatch(result.stdout, /REST base URL:/);
  assert.match(
    result.stdout,
    /- Hosted cron table: store_price_drop_notification_runs/,
  );
  assert.match(result.stdout, /- Function: notify-price-drop/);
  assert.match(result.stdout, /- Run ID: price-drop-cli-scheduled/);
});

test("expected account deletion storage bucket count mirrors the Edge contract", () => {
  assert.equal(
    accountDeletionStorageBucketCountFromContractSource(`
      export const ACCOUNT_DELETION_USER_STORAGE_BUCKETS = [
        "one",
        "two",
      ];
    `),
    2,
  );
  assert.equal(
    expectedAccountDeletionStorageBucketCount,
    accountDeletionStorageBucketCountFromContract(),
  );
});

test("deriveRestBaseUrl prefers explicit REST URL and otherwise derives from Supabase URL", () => {
  assert.equal(
    deriveRestBaseUrl({
      SUPABASE_PROJECT_REF: "ignored",
      SUPABASE_REST_URL: "https://awebfvfyqzwapcgixdfj.supabase.co/rest/v1/",
      SUPABASE_URL: "https://ignored.supabase.co",
    }),
    "https://awebfvfyqzwapcgixdfj.supabase.co/rest/v1",
  );
  assert.equal(
    deriveRestBaseUrl({
      SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co/",
    }),
    "https://awebfvfyqzwapcgixdfj.supabase.co/rest/v1",
  );
  assert.equal(
    deriveRestBaseUrl({ SUPABASE_PROJECT_REF: "awebfvfyqzwapcgixdfj" }),
    "https://awebfvfyqzwapcgixdfj.supabase.co/rest/v1",
  );
  assert.equal(
    deriveRestBaseUrl({
      SUPABASE_REST_URL: "placeholder",
      SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co/",
    }),
    "https://awebfvfyqzwapcgixdfj.supabase.co/rest/v1",
  );
});

test("deriveRestBaseUrl rejects unsafe and placeholder-shaped REST targets", () => {
  assert.equal(
    deriveRestBaseUrl({
      SUPABASE_PROJECT_REF: "your-project-ref",
      SUPABASE_REST_URL:
        "https://user:secret@example.supabase.co/rest/v1?token=secret",
      SUPABASE_URL: "http://awebfvfyqzwapcgixdfj.supabase.co",
    }),
    "",
  );
  assert.equal(
    deriveRestBaseUrl({
      SUPABASE_REST_URL:
        "https://awebfvfyqzwapcgixdfj.supabase.co/rest/v1#secret",
    }),
    "",
  );
  assert.equal(
    deriveRestBaseUrl({
      SUPABASE_REST_URL:
        "https://awebfvfyqzwapcgixdfj.supabase.co:8443/rest/v1",
    }),
    "",
  );
  assert.equal(
    deriveRestBaseUrl({
      SUPABASE_PROJECT_REF: "replace-me",
      SUPABASE_URL: "https://example.supabase.co",
    }),
    "",
  );
  assert.equal(deriveRestBaseUrl({ SUPABASE_PROJECT_REF: "test" }), "");
  assert.equal(deriveRestBaseUrl({ SUPABASE_PROJECT_REF: "abc" }), "");
  assert.equal(deriveRestBaseUrl({ SUPABASE_PROJECT_REF: "abc123" }), "");
  assert.equal(
    deriveRestBaseUrl({ SUPABASE_PROJECT_REF: "awebfvfyqzwapcgixdf-" }),
    "",
  );
  assert.equal(
    deriveRestBaseUrl({ SUPABASE_URL: "https://abc.supabase.co" }),
    "",
  );
  assert.equal(
    deriveRestBaseUrl({ SUPABASE_URL: "https://abc123.supabase.co" }),
    "",
  );
  assert.equal(
    deriveRestBaseUrl({
      SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co/rest/v1",
    }),
    "",
  );
  assert.equal(
    deriveRestBaseUrl({
      SUPABASE_REST_URL: "https://awebfvfyqzwapcgixdfj.supabase.co",
    }),
    "",
  );
  assert.equal(
    deriveRestBaseUrl({
      SUPABASE_REST_URL:
        "https://awebfvfyqzwapcgixdfj.supabase.co/rest/v1/extra",
    }),
    "",
  );
});

test("planSummary does not echo raw URLs or invalid freshness values", () => {
  const summary = planSummary({
    OGL_HOSTED_CRON_FRESHNESS_HOURS: "sk_live_should_not_echo_123456",
    SUPABASE_REST_URL:
      "https://user:secret@example.supabase.co/rest/v1?token=secret",
  });

  assert.deepEqual(summary, {
    freshnessHours: "(invalid)",
    restBaseUrl:
      "(set SUPABASE_REST_URL or SUPABASE_URL or SUPABASE_PROJECT_REF)",
    selectedChecks: ["price-drop", "presence-poll", "account-deletion"],
  });
  assert.equal(
    JSON.stringify(summary).includes("sk_live_should_not_echo"),
    false,
  );
  assert.equal(JSON.stringify(summary).includes("secret"), false);
});

test("missingRequiredEnv reports names only", () => {
  assert.deepEqual(missingRequiredEnv({}), [
    "SUPABASE_REST_URL or SUPABASE_URL or SUPABASE_PROJECT_REF",
    "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY + SUPABASE_AUTH_JWT",
  ]);
  assert.deepEqual(missingRequiredEnv(env), []);
  assert.deepEqual(
    missingRequiredEnv({
      SUPABASE_ANON_KEY: anonJwt,
      SUPABASE_AUTH_JWT: authJwt,
      SUPABASE_URL: supabaseUrl,
    }),
    [],
  );
  assert.deepEqual(
    missingRequiredEnv({
      SUPABASE_ANON_KEY: anonJwt,
      SUPABASE_AUTH_JWT: anonJwt,
      SUPABASE_URL: supabaseUrl,
    }),
    ["SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY + SUPABASE_AUTH_JWT"],
  );
  assert.deepEqual(
    missingRequiredEnv({
      SUPABASE_PROJECT_REF: "abc123",
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleJwt,
    }),
    ["SUPABASE_REST_URL or SUPABASE_URL or SUPABASE_PROJECT_REF"],
  );
});

test("missingRequiredEnv rejects weak REST auth values by name only", () => {
  const weakEnv = {
    SUPABASE_ANON_KEY: "anon-real",
    SUPABASE_AUTH_JWT: "jwt-real",
    SUPABASE_SERVICE_ROLE_KEY: "configured-service-role-key",
    SUPABASE_URL: supabaseUrl,
  };

  const missing = missingRequiredEnv(weakEnv);

  assert.deepEqual(missing, [
    "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY + SUPABASE_AUTH_JWT",
  ]);
  assert.equal(
    JSON.stringify(missing).includes("configured-service-role-key"),
    false,
  );
  assert.equal(JSON.stringify(missing).includes("anon-real"), false);
  assert.equal(JSON.stringify(missing).includes("jwt-real"), false);
});

test("missingRequiredEnv rejects service-role REST auth for a different project without echoing refs", async () => {
  const mismatchEnv = {
    SUPABASE_REST_URL: `${supabaseUrl}/rest/v1`,
    SUPABASE_SERVICE_ROLE_KEY: otherServiceRoleJwt,
  };

  const missing = missingRequiredEnv(mismatchEnv);

  assert.deepEqual(missing, [
    "SUPABASE_REST_URL/SUPABASE_URL/SUPABASE_PROJECT_REF must match REST auth project ref",
  ]);
  assert.equal(JSON.stringify(missing).includes(projectRef), false);
  assert.equal(JSON.stringify(missing).includes(otherProjectRef), false);

  let called = false;
  await assert.rejects(
    () =>
      collectCronEvidence(mismatchEnv, async () => {
        called = true;
        return new Response("[]", { status: 200 });
      }),
    (error) => {
      assert.match(error.message, /Missing hosted cron evidence env/);
      assert.match(error.message, /must match REST auth project ref/);
      assert.equal(error.message.includes(projectRef), false);
      assert.equal(error.message.includes(otherProjectRef), false);
      assert.equal(error.message.includes(otherServiceRoleJwt), false);
      return true;
    },
  );
  assert.equal(called, false);
});

test("missingRequiredEnv rejects anon/auth REST auth for a different project without echoing refs", () => {
  const cases = [
    {
      env: {
        SUPABASE_ANON_KEY: otherAnonJwt,
        SUPABASE_AUTH_JWT: authJwt,
        SUPABASE_URL: supabaseUrl,
      },
      token: otherAnonJwt,
    },
    {
      env: {
        SUPABASE_ANON_KEY: anonJwt,
        SUPABASE_AUTH_JWT: otherAuthJwt,
        SUPABASE_URL: supabaseUrl,
      },
      token: otherAuthJwt,
    },
  ];

  for (const { env: mismatchEnv, token } of cases) {
    const missing = missingRequiredEnv(mismatchEnv);

    assert.deepEqual(missing, [
      "SUPABASE_REST_URL/SUPABASE_URL/SUPABASE_PROJECT_REF must match REST auth project ref",
    ]);
    assert.equal(JSON.stringify(missing).includes(projectRef), false);
    assert.equal(JSON.stringify(missing).includes(otherProjectRef), false);
    assert.equal(JSON.stringify(missing).includes(token), false);
  }
});

test("missingRequiredEnv rejects expired and not-yet-valid JWT-shaped REST auth without echoing tokens", async () => {
  const expiredServiceRoleJwt = syntheticSupabaseJwt({
    exp: 1_600_000_000,
    role: "service_role",
  });
  const epochExpiredServiceRoleJwt = syntheticSupabaseJwt({
    exp: 1,
    role: "service_role",
  });
  const notYetValidServiceRoleJwt = syntheticSupabaseJwt({
    nbf: Math.floor(Date.now() / 1000) + 600,
    role: "service_role",
  });

  for (const token of [
    expiredServiceRoleJwt,
    epochExpiredServiceRoleJwt,
    notYetValidServiceRoleJwt,
  ]) {
    const jwtEnv = {
      SUPABASE_SERVICE_ROLE_KEY: token,
      SUPABASE_URL: supabaseUrl,
    };

    const missing = missingRequiredEnv(jwtEnv);

    assert.deepEqual(missing, [
      "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY + SUPABASE_AUTH_JWT",
    ]);
    assert.equal(JSON.stringify(missing).includes(token), false);
    assert.equal(JSON.stringify(missing).includes(projectRef), false);

    let called = false;
    await assert.rejects(
      () =>
        collectCronEvidence(jwtEnv, async () => {
          called = true;
          return new Response("[]", { status: 200 });
        }),
      (error) => {
        assert.match(error.message, /Missing hosted cron evidence env/);
        assert.match(
          error.message,
          /SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY \+ SUPABASE_AUTH_JWT/,
        );
        assert.equal(error.message.includes(token), false);
        assert.equal(error.message.includes(projectRef), false);
        return true;
      },
    );
    assert.equal(called, false);
  }
});

test("collectCronEvidence rejects weak REST auth before fetch without echoing raw values", async () => {
  const weakEnv = {
    SUPABASE_ANON_KEY: "anon-real",
    SUPABASE_AUTH_JWT: "jwt-real",
    SUPABASE_SERVICE_ROLE_KEY: "configured-service-role-key",
    SUPABASE_URL: supabaseUrl,
  };
  let called = false;

  await assert.rejects(
    () =>
      collectCronEvidence(weakEnv, async () => {
        called = true;
        return new Response("[]", { status: 200 });
      }),
    (error) => {
      assert.match(error.message, /Missing hosted cron evidence env/);
      assert.match(
        error.message,
        /SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY \+ SUPABASE_AUTH_JWT/,
      );
      assert.equal(
        error.message.includes("configured-service-role-key"),
        false,
      );
      assert.equal(error.message.includes("anon-real"), false);
      assert.equal(error.message.includes("jwt-real"), false);
      return true;
    },
  );
  assert.equal(called, false);
});

test("missingRequiredEnv rejects placeholder env values without printing them", async () => {
  const placeholderEnv = {
    SUPABASE_SERVICE_ROLE_KEY: "set",
    SUPABASE_URL: "placeholder",
  };

  assert.deepEqual(missingRequiredEnv(placeholderEnv), [
    "SUPABASE_REST_URL or SUPABASE_URL or SUPABASE_PROJECT_REF",
    "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY + SUPABASE_AUTH_JWT",
  ]);
  await assert.rejects(
    () => collectCronEvidence(placeholderEnv, async () => new Response("[]")),
    (error) => {
      assert.match(error.message, /Missing hosted cron evidence env/);
      assert.equal(error.message.includes("placeholder"), false);
      assert.equal(error.message.includes("set"), false);
      return true;
    },
  );
});

test("runbook documents lane-specific external preflight", () => {
  assert.match(
    runbook,
    /OGL_EXTERNAL_EVIDENCE_GATES=hosted-supabase-cron pnpm external:evidence:preflight/,
  );
  assert.match(runbook, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(runbook, /SUPABASE_ANON_KEY/);
  assert.match(runbook, /PRICE_DROP_NOTIFY_SECRET/);
  assert.match(runbook, /PRESENCE_POLL_SECRET/);
  assert.match(runbook, /JWT-shaped/i);
  assert.match(runbook, /service_role/);
  assert.match(runbook, /role `anon`/);
  assert.match(runbook, /SUPABASE_AUTH_JWT[\s\S]*role `authenticated`/);
  assert.match(runbook, /skipped_summary\.inactive = 0/);
  assert.match(runbook, /pnpm hosted:cron-evidence:artifact-hints/);
  assert.match(
    runbook,
    /OGL_HOSTED_CRON_EVIDENCE_CHECKS=price-drop pnpm hosted:cron-evidence:artifact-hints/,
  );
  assert.match(
    runbook,
    /Leave `OGL_HOSTED_CRON_FRESHNESS_HOURS` unset unless a release operator[\s\S]*intentionally overrides every selected lane/i,
  );
  assert.match(runbook, /presence-poll[\s\S]*15 minute/i);
  assert.match(
    runbook,
    /pnpm hosted:cron-evidence:artifact-hints --checks=price-drop/,
  );
  assert.match(runbook, /does not check proof rows/i);
});

test("buildLatestScheduledRunUrl requests the latest scheduled attempt without passing-row filters", () => {
  const check = cronEvidenceChecks[0];
  const url = new URL(buildLatestScheduledRunUrl(check, env));

  assert.equal(url.pathname, `/rest/v1/${check.table}`);
  assert.equal(url.searchParams.get("trigger_source"), "eq.scheduled");
  assert.equal(url.searchParams.has("dry_run"), false);
  assert.equal(url.searchParams.has("status"), false);
  assert.equal(url.searchParams.get("order"), "completed_at.desc");
  assert.equal(url.searchParams.get("limit"), "1");
});

test("fetchLatestScheduledRun uses GET and does not include secret values in errors", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ init, url });
    return new Response(JSON.stringify({ message: "denied" }), { status: 403 });
  };

  await assert.rejects(
    () => fetchLatestScheduledRun(cronEvidenceChecks[0], env, fetchImpl),
    (error) => {
      assert.match(error.message, /HTTP 403/);
      assert.equal(error.message.includes(serviceRoleJwt), false);
      return true;
    },
  );
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${serviceRoleJwt}`);
});

test("fetchLatestScheduledRun falls back from placeholder service role to anon auth", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ init, url });
    return new Response(JSON.stringify([]), { status: 200 });
  };

  await fetchLatestScheduledRun(
    cronEvidenceChecks[0],
    {
      SUPABASE_ANON_KEY: anonJwt,
      SUPABASE_AUTH_JWT: authJwt,
      SUPABASE_SERVICE_ROLE_KEY: "set",
      SUPABASE_URL: supabaseUrl,
    },
    fetchImpl,
  );

  assert.equal(calls[0].init.headers.apikey, anonJwt);
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${authJwt}`);
});

test("fetchLatestScheduledRun rejects missing REST base before fetch", async () => {
  let called = false;
  await assert.rejects(
    () =>
      fetchLatestScheduledRun(
        cronEvidenceChecks[0],
        {
          SUPABASE_SERVICE_ROLE_KEY: serviceRoleJwt,
        },
        async () => {
          called = true;
          return new Response(JSON.stringify([]), { status: 200 });
        },
      ),
    (error) => {
      assert.match(error.message, /Missing hosted cron evidence env/);
      assert.match(
        error.message,
        /SUPABASE_REST_URL or SUPABASE_URL or SUPABASE_PROJECT_REF/,
      );
      assert.equal(error.message.includes(serviceRoleJwt), false);
      return true;
    },
  );
  assert.equal(called, false);
});

test("summarizeRun accepts fresh completed scheduled rows and redacts row detail", () => {
  const result = summarizeRun(
    cronEvidenceChecks[0],
    completedRow(cronEvidenceChecks[0], {
      alerts_marked_count: 3,
      candidate_count: 3,
      limit_count: 5,
      notification_payload: "must not be included",
      notifications_recorded_count: 3,
      raw_user_id: "must not be included",
      run_id: "run-1",
      scanned_count: 3,
    }),
    new Date("2026-06-16T10:30:00.000Z"),
    60 * 60 * 1000,
  );

  assert.equal(result.ready, true);
  assert.equal(result.ageMinutes, 30);
  assert.equal(result.counts.alerts_marked_count, 3);
  assert.equal(result.counts.notifications_recorded_count, 3);
  assert.equal(result.counts.limit_count, 5);
  assert.equal(JSON.stringify(result).includes("raw_user_id"), false);
  assert.equal(JSON.stringify(result).includes("must not be included"), false);
});

test("summarizeRun rejects unsafe run IDs and invalid count values without echoing them", () => {
  for (const runId of [
    "sk_live_should_not_echo_1234567890",
    "sk_test_should_not_echo_1234567890",
    "rk_live_should_not_echo_1234567890",
    "rk_test_should_not_echo_1234567890",
  ]) {
    const result = summarizeRun(
      cronEvidenceChecks[0],
      completedRow(cronEvidenceChecks[0], {
        notifications_recorded_count: "secret-count-value",
        run_id: runId,
      }),
      new Date("2026-06-16T10:30:00.000Z"),
      60 * 60 * 1000,
    );

    assert.equal(result.ready, false);
    assert.equal(result.runId, "[redacted-invalid-run-id]");
    assert.equal("notifications_recorded_count" in result.counts, false);
    assert.equal(result.counts.alerts_marked_count, 0);
    assert.deepEqual(result.validationErrors, [
      "run_id is not a safe evidence identifier.",
      "notifications_recorded_count is invalid.",
    ]);
    assert.equal(JSON.stringify(result).includes(runId), false);
    assert.equal(JSON.stringify(result).includes("secret-count-value"), false);

    const packet = hostedCronEvidencePacket(
      [result],
      env,
      new Date("2026-06-16T10:31:00.000Z"),
      [cronEvidenceChecks[0]],
    );
    assert.equal(packet.includes(runId), false);
    assert.match(packet, /\[redacted-invalid-run-id\]/);
  }
});

test("summarizeRun rejects secret environment names as run IDs", () => {
  const result = summarizeRun(
    cronEvidenceChecks[0],
    completedRow(cronEvidenceChecks[0], {
      run_id: "PRICE_DROP_NOTIFY_SECRET",
    }),
    new Date("2026-06-16T10:30:00.000Z"),
    60 * 60 * 1000,
  );

  assert.equal(result.ready, false);
  assert.equal(result.runId, "[redacted-invalid-run-id]");
  assert.deepEqual(result.validationErrors, [
    "run_id is not a safe evidence identifier.",
  ]);
  assert.equal(
    JSON.stringify(result).includes("PRICE_DROP_NOTIFY_SECRET"),
    false,
  );
});

test("summarizeRun requires selected aggregate count fields", () => {
  const accountDeletion = cronEvidenceChecks.find(
    (check) => check.id === "account-deletion",
  );
  const row = completedRow(accountDeletion);
  delete row.failed_count;

  const result = summarizeRun(
    accountDeletion,
    row,
    new Date("2026-06-16T10:30:00.000Z"),
    60 * 60 * 1000,
  );

  assert.equal(result.ready, false);
  assert.match(result.validationErrors.join("\n"), /failed_count missing/);
});

test("summarizeRun rejects impossible price-drop aggregate count relationships", () => {
  const priceDrop = cronEvidenceChecks.find(
    (check) => check.id === "price-drop",
  );
  const result = summarizeRun(
    priceDrop,
    completedRow(priceDrop, {
      alerts_marked_count: 3,
      candidate_count: 3,
      limit_count: 2,
      notifications_recorded_count: 2,
      scanned_count: 4,
      skipped_summary: {
        already_notified: 0,
        inactive: 0,
        invalid_product: 0,
        invalid_target: 0,
        not_met: 1,
        unpublished_product: 0,
      },
    }),
    new Date("2026-06-16T10:30:00.000Z"),
    60 * 60 * 1000,
  );

  assert.equal(result.ready, false);
  assert.deepEqual(result.validationErrors, [
    "scanned_count is greater than limit_count.",
    "notifications_recorded_count does not equal candidate_count.",
  ]);
});

test("summarizeRun requires price-drop inactive skip evidence to be present and zero", () => {
  const priceDrop = cronEvidenceChecks.find(
    (check) => check.id === "price-drop",
  );
  const missingInactive = completedRow(priceDrop);
  delete missingInactive.skipped_summary.inactive;

  const missingResult = summarizeRun(
    priceDrop,
    missingInactive,
    new Date("2026-06-16T10:30:00.000Z"),
    60 * 60 * 1000,
  );

  assert.equal(missingResult.ready, false);
  assert.match(
    missingResult.validationErrors.join("\n"),
    /skipped_summary\.inactive missing or invalid/,
  );

  const invalidResult = summarizeRun(
    priceDrop,
    completedRow(priceDrop, {
      skipped_summary: {
        already_notified: 0,
        inactive: "not-a-count",
        invalid_product: 0,
        invalid_target: 0,
        not_met: 0,
        unpublished_product: 0,
      },
    }),
    new Date("2026-06-16T10:30:00.000Z"),
    60 * 60 * 1000,
  );

  assert.equal(invalidResult.ready, false);
  assert.match(
    invalidResult.validationErrors.join("\n"),
    /skipped_summary\.inactive missing or invalid/,
  );

  const nonZeroResult = summarizeRun(
    priceDrop,
    completedRow(priceDrop, {
      candidate_count: 2,
      notifications_recorded_count: 2,
      alerts_marked_count: 2,
      skipped_summary: {
        already_notified: 0,
        inactive: 1,
        invalid_product: 0,
        invalid_target: 0,
        not_met: 0,
        unpublished_product: 0,
      },
    }),
    new Date("2026-06-16T10:30:00.000Z"),
    60 * 60 * 1000,
  );

  assert.equal(nonZeroResult.ready, false);
  assert.match(
    nonZeroResult.validationErrors.join("\n"),
    /skipped_summary\.inactive is greater than 0/,
  );
});

test("summarizeRun rejects impossible presence poll aggregate count relationships", () => {
  const presencePoll = cronEvidenceChecks.find(
    (check) => check.id === "presence-poll",
  );
  const result = summarizeRun(
    presencePoll,
    completedRow(presencePoll, {
      activity_inserted_count: 4,
      polled_count: 2,
      presence_updated_count: 3,
      provider_result_summary: {
        byPlatform: { steam: 2 },
        byStatus: { online: 2 },
        total: 2,
      },
      scanned_count: 4,
      skipped_count: 1,
      skipped_summary: {
        byPlatform: { epic: 1 },
        byReason: { cached: 1 },
        maxRetryAfterSeconds: 0,
        rateLimited: 0,
        total: 1,
      },
    }),
    new Date("2026-06-16T10:30:00.000Z"),
    60 * 60 * 1000,
  );

  assert.equal(result.ready, false);
  assert.deepEqual(result.validationErrors, [
    "polled_count + skipped_count does not equal scanned_count.",
    "presence_updated_count is greater than polled_count.",
    "activity_inserted_count is greater than presence_updated_count.",
  ]);
});

test("summarizeRun rejects impossible account deletion aggregate count relationships", () => {
  const accountDeletion = cronEvidenceChecks.find(
    (check) => check.id === "account-deletion",
  );
  const result = summarizeRun(
    accountDeletion,
    completedRow(accountDeletion, {
      claimed_count: 3,
      completed_count: 1,
      due_request_count: 4,
      failed_count: 0,
      limit_count: 3,
      skipped_count: 0,
      would_process_count: 1,
    }),
    new Date("2026-06-16T10:30:00.000Z"),
    60 * 60 * 1000,
  );

  assert.equal(result.ready, false);
  assert.deepEqual(result.validationErrors, [
    "due_request_count is greater than limit_count.",
    "completed_count + failed_count does not equal claimed_count.",
    "claimed_count + skipped_count does not equal due_request_count.",
    "would_process_count is greater than 0 for a live row.",
  ]);
});

test("summarizeRun rejects aggregate summary totals that do not match counts", () => {
  const presencePoll = cronEvidenceChecks.find(
    (check) => check.id === "presence-poll",
  );
  const accountDeletion = cronEvidenceChecks.find(
    (check) => check.id === "account-deletion",
  );

  const presenceResult = summarizeRun(
    presencePoll,
    completedRow(presencePoll, {
      polled_count: 2,
      presence_updated_count: 2,
      provider_result_summary: {
        byPlatform: { steam: 3 },
        byStatus: { online: 3 },
        total: 3,
      },
      scanned_count: 3,
      skipped_count: 1,
      skipped_summary: {
        byPlatform: { epic: 2 },
        byReason: { cached: 2 },
        maxRetryAfterSeconds: 0,
        rateLimited: 0,
        total: 2,
      },
    }),
    new Date("2026-06-16T10:30:00.000Z"),
    60 * 60 * 1000,
  );
  const deletionResult = summarizeRun(
    accountDeletion,
    completedRow(accountDeletion, {
      claimed_count: 1,
      completed_count: 1,
      due_request_count: 2,
      limit_count: 2,
      skipped_count: 1,
      skipped_summary: {},
      storage_bucket_count: expectedAccountDeletionStorageBucketCount - 1,
    }),
    new Date("2026-06-16T10:30:00.000Z"),
    60 * 60 * 1000,
  );

  assert.equal(presenceResult.ready, false);
  assert.deepEqual(presenceResult.validationErrors, [
    "provider_result_summary.total does not equal polled_count.",
    "skipped_summary.total does not equal skipped_count.",
  ]);
  assert.equal(deletionResult.ready, false);
  assert.deepEqual(deletionResult.validationErrors, [
    "skipped_summary total does not equal skipped_count.",
    "storage_bucket_count does not match configured buckets.",
  ]);
});

test("summarizeRun rejects stale, dry-run, and non-scheduled rows", () => {
  const result = summarizeRun(
    cronEvidenceChecks[1],
    completedRow(cronEvidenceChecks[1], {
      completed_at: "2026-06-15T10:00:00.000Z",
      dry_run: true,
      run_id: "run-2",
      status: "dry_run",
      trigger_source: "hosted_deploy_gate",
    }),
    new Date("2026-06-16T12:00:00.000Z"),
    60 * 60 * 1000,
  );

  assert.equal(result.ready, false);
  assert.deepEqual(result.validationErrors, [
    "trigger_source is not scheduled.",
    "dry_run is not false.",
    "status is not completed.",
    "completed_at is older than the configured freshness window.",
  ]);
});

test("summarizeRun rejects completed account deletion rows with failures", () => {
  const result = summarizeRun(
    cronEvidenceChecks.find((check) => check.id === "account-deletion"),
    completedRow(
      cronEvidenceChecks.find((check) => check.id === "account-deletion"),
      {
        claimed_count: 1,
        due_request_count: 1,
        failed_count: 1,
        limit_count: 1,
        run_id: "run-with-failure",
      },
    ),
    new Date("2026-06-16T10:30:00.000Z"),
    60 * 60 * 1000,
  );

  assert.equal(result.ready, false);
  assert.equal(result.counts.failed_count, 1);
  assert.deepEqual(result.validationErrors, [
    "failed_count is greater than 0.",
  ]);
});

test("collectCronEvidence returns one status per cron evidence table", async () => {
  const rows = new Map(
    cronEvidenceChecks.map((check) => [check.table, completedRow(check)]),
  );
  const fetchImpl = async (url) => {
    const table = new URL(url).pathname.split("/").pop();
    return new Response(JSON.stringify([rows.get(table)]), { status: 200 });
  };

  const results = await collectCronEvidence(
    { ...env, OGL_HOSTED_CRON_FRESHNESS_HOURS: "3" },
    fetchImpl,
    new Date("2026-06-16T11:00:00.000Z"),
  );

  assert.deepEqual(
    results.map((result) => [result.id, result.ready]),
    [
      ["price-drop", true],
      ["presence-poll", true],
      ["account-deletion", true],
    ],
  );
});

test("collectCronEvidence reports latest scheduled attempts that are failed or dry-run", async () => {
  const priceDrop = cronEvidenceChecks.find(
    (check) => check.id === "price-drop",
  );
  const presencePoll = cronEvidenceChecks.find(
    (check) => check.id === "presence-poll",
  );
  const rows = new Map([
    [
      priceDrop.table,
      completedRow(priceDrop, {
        run_id: "price-drop-latest-failed",
        status: "failed",
      }),
    ],
    [
      presencePoll.table,
      completedRow(presencePoll, {
        dry_run: true,
        run_id: "presence-poll-latest-dry-run",
      }),
    ],
  ]);
  const fetchImpl = async (url) => {
    const table = new URL(url).pathname.split("/").pop();
    return new Response(JSON.stringify([rows.get(table)]), { status: 200 });
  };

  const results = await collectCronEvidence(
    { ...env, OGL_HOSTED_CRON_FRESHNESS_HOURS: "3" },
    fetchImpl,
    new Date("2026-06-16T11:00:00.000Z"),
    [priceDrop, presencePoll],
  );

  assert.deepEqual(
    results.map((result) => [result.id, result.ready, result.validationErrors]),
    [
      ["price-drop", false, ["status is not completed."]],
      ["presence-poll", false, ["dry_run is not false."]],
    ],
  );
});

test("collectCronEvidence uses tighter default freshness for presence than daily account deletion", async () => {
  const presencePoll = cronEvidenceChecks.find(
    (check) => check.id === "presence-poll",
  );
  const accountDeletion = cronEvidenceChecks.find(
    (check) => check.id === "account-deletion",
  );
  const rows = new Map([
    [
      presencePoll.table,
      completedRow(presencePoll, {
        completed_at: "2026-06-16T10:00:00.000Z",
        run_id: "presence-poll-two-hours-old",
      }),
    ],
    [
      accountDeletion.table,
      completedRow(accountDeletion, {
        completed_at: "2026-06-15T12:30:00.000Z",
        run_id: "account-deletion-daily-old",
      }),
    ],
  ]);
  const fetchImpl = async (url) => {
    const table = new URL(url).pathname.split("/").pop();
    return new Response(JSON.stringify([rows.get(table)]), { status: 200 });
  };

  const results = await collectCronEvidence(
    env,
    fetchImpl,
    new Date("2026-06-16T12:00:00.000Z"),
    [presencePoll, accountDeletion],
  );

  assert.deepEqual(
    results.map((result) => [result.id, result.ready, result.validationErrors]),
    [
      [
        "presence-poll",
        false,
        ["completed_at is older than the configured freshness window."],
      ],
      ["account-deletion", true, []],
    ],
  );
});

test("collectCronEvidence reads only selected cron evidence tables", async () => {
  const priceDropCheck = cronEvidenceChecks.find(
    (check) => check.id === "price-drop",
  );
  assert.ok(priceDropCheck);
  const requestedTables = [];
  const fetchImpl = async (url) => {
    requestedTables.push(new URL(url).pathname.split("/").pop());
    return new Response(JSON.stringify([completedRow(priceDropCheck)]), {
      status: 200,
    });
  };

  const results = await collectCronEvidence(
    {
      ...env,
      OGL_HOSTED_CRON_EVIDENCE_CHECKS: "price-drop",
      OGL_HOSTED_CRON_FRESHNESS_HOURS: "3",
    },
    fetchImpl,
    new Date("2026-06-16T11:00:00.000Z"),
  );

  assert.deepEqual(requestedTables, ["store_price_drop_notification_runs"]);
  assert.deepEqual(
    results.map((result) => [result.id, result.ready]),
    [["price-drop", true]],
  );
});

test("collectCronEvidence reports per-table REST read failures", async () => {
  const rows = new Map(
    cronEvidenceChecks.map((check) => [check.table, completedRow(check)]),
  );
  const fetchImpl = async (url) => {
    const table = new URL(url).pathname.split("/").pop();
    if (table === "store_price_drop_notification_runs") {
      return new Response(JSON.stringify({ message: "denied secret" }), {
        status: 403,
      });
    }
    if (table === "presence_poll_runs") {
      return new Response(JSON.stringify({ message: "broken secret" }), {
        status: 500,
      });
    }
    return new Response(JSON.stringify([rows.get(table)]), { status: 200 });
  };

  const results = await collectCronEvidence(
    { ...env, OGL_HOSTED_CRON_FRESHNESS_HOURS: "3" },
    fetchImpl,
    new Date("2026-06-16T11:00:00.000Z"),
  );

  assert.deepEqual(
    results.map((result) => [result.id, result.ready, result.validationErrors]),
    [
      ["price-drop", false, ["Evidence REST read failed with HTTP 403."]],
      ["presence-poll", false, ["Evidence REST read failed with HTTP 500."]],
      ["account-deletion", true, []],
    ],
  );
  assert.equal(JSON.stringify(results).includes("secret"), false);
});
