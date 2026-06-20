#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const deployFunctions = Object.freeze([
  { name: "cancel-account-deletion", verifyJwt: true },
  { name: "community-artwork-moderation", verifyJwt: true },
  { name: "export-user-data", verifyJwt: true },
  { name: "ingest-achievements", verifyJwt: true },
  { name: "ingest-playtime", verifyJwt: true },
  { name: "invite-hosted-proof", verifyJwt: true },
  { name: "mobile-push-registration", verifyJwt: true },
  { name: "notify-price-drop", verifyJwt: false },
  { name: "poll-platform-presence", verifyJwt: false },
  { name: "process-account-deletions", verifyJwt: false },
  { name: "rawg-assets", verifyJwt: true },
  { name: "remote-companion-relay", verifyJwt: true },
  { name: "request-account-deletion", verifyJwt: true },
  { name: "store-download-build", verifyJwt: true },
  { name: "store-order-support", verifyJwt: true },
  { name: "stripe-create-checkout", verifyJwt: true },
  { name: "stripe-webhook", verifyJwt: false },
]);

export const cronDryRunSmokes = Object.freeze([
  {
    body: { dry_run: true, limit: 1, triggerSource: "hosted_deploy_gate" },
    name: "process-account-deletions",
    secretEnv: "ACCOUNT_DELETION_PROCESSOR_SECRET",
  },
  {
    body: {
      alertIds: ["00000000-0000-4000-8000-000000000000"],
      dryRun: true,
      limit: 1,
      triggerSource: "hosted_deploy_gate",
    },
    name: "notify-price-drop",
    secretEnv: "PRICE_DROP_NOTIFY_SECRET",
  },
  {
    body: {
      dryRun: true,
      force: false,
      limit: 1,
      platforms: ["og"],
      triggerSource: "hosted_deploy_gate",
    },
    name: "poll-platform-presence",
    secretEnv: "PRESENCE_POLL_SECRET",
  },
]);

export const accountDeletionUserStorageBuckets = Object.freeze([
  "game-saves",
  "avatars",
  "profile-banners",
  "profile-showcases",
  "screenshots",
  "game-artwork",
]);

export const optionsSmokes = Object.freeze(
  deployFunctions.map((fn) => ({ name: fn.name })),
);

export const schedulerPlan = Object.freeze([
  {
    body: {
      dryRun: false,
      force: false,
      limit: 100,
      triggerSource: "scheduled",
    },
    cadence: "every minute",
    functionName: "poll-platform-presence",
    secretEnv: "PRESENCE_POLL_SECRET",
  },
  {
    body: { dryRun: false, limit: 500, triggerSource: "scheduled" },
    cadence: "hourly or after price imports",
    functionName: "notify-price-drop",
    secretEnv: "PRICE_DROP_NOTIFY_SECRET",
  },
  {
    body: { dry_run: false, limit: 20, triggerSource: "scheduled" },
    cadence: "daily",
    functionName: "process-account-deletions",
    secretEnv: "ACCOUNT_DELETION_PROCESSOR_SECRET",
  },
]);

function shellSingleQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export function schedulerBaseUrlSetup(env = process.env) {
  if (!hostedProjectRefsMatch(env)) {
    return {
      missingEnv: [hostedProjectRefMatchEnv],
      setupCommand:
        "Resolve SUPABASE_PROJECT_REF/SUPABASE_URL/SUPABASE_FUNCTIONS_URL project ref mismatch before scheduler setup.",
      sourceEnv: null,
      state: "mismatch",
      targetEnv: "SUPABASE_FUNCTIONS_URL",
    };
  }

  if (safeFunctionsBaseUrl(env.SUPABASE_FUNCTIONS_URL)) {
    return {
      missingEnv: [],
      setupCommand: "Use the configured SUPABASE_FUNCTIONS_URL value.",
      sourceEnv: "SUPABASE_FUNCTIONS_URL",
      state: "configured",
      targetEnv: "SUPABASE_FUNCTIONS_URL",
    };
  }

  if (safeProjectBaseUrl(env.SUPABASE_URL)) {
    return {
      missingEnv: [],
      setupCommand:
        'export SUPABASE_FUNCTIONS_URL="${SUPABASE_URL%/}/functions/v1"',
      sourceEnv: "SUPABASE_URL",
      state: "derive",
      targetEnv: "SUPABASE_FUNCTIONS_URL",
    };
  }

  if (safeProjectRef(env.SUPABASE_PROJECT_REF)) {
    return {
      missingEnv: [],
      setupCommand:
        'export SUPABASE_FUNCTIONS_URL="https://$SUPABASE_PROJECT_REF.supabase.co/functions/v1"',
      sourceEnv: "SUPABASE_PROJECT_REF",
      state: "derive",
      targetEnv: "SUPABASE_FUNCTIONS_URL",
    };
  }

  return {
    missingEnv: [
      "SUPABASE_FUNCTIONS_URL or SUPABASE_URL or SUPABASE_PROJECT_REF",
    ],
    setupCommand:
      "Set SUPABASE_FUNCTIONS_URL directly or provide SUPABASE_URL/SUPABASE_PROJECT_REF before scheduler setup.",
    sourceEnv: null,
    state: "missing",
    targetEnv: "SUPABASE_FUNCTIONS_URL",
  };
}

export function buildSchedulerPacket(plan = schedulerPlan, env = process.env) {
  const baseUrlSetup = schedulerBaseUrlSetup(env);
  const includeCommands =
    baseUrlSetup.state === "configured" || baseUrlSetup.state === "derive";
  return {
    baseUrlSetup,
    command: "pnpm hosted:deploy-gate:scheduler-packet",
    commandsAvailable: includeCommands,
    disclaimer:
      "Redacted scheduler command/config packet only; it does not read secret values, does not create schedulers, does not call functions, does not mutate data, and does not prove external scheduler success.",
    functionsBaseUrlEnv: "SUPABASE_FUNCTIONS_URL",
    items: plan.map(({ body, cadence, functionName, secretEnv }) => {
      const bodyJson = JSON.stringify(body);
      return {
        body: JSON.parse(bodyJson),
        bodyJson,
        cadence,
        command: includeCommands
          ? `curl -fsS -X POST "$SUPABASE_FUNCTIONS_URL/${functionName}" -H "Authorization: Bearer $${secretEnv}" -H "Content-Type: application/json" --data ${shellSingleQuote(
              bodyJson,
            )}`
          : null,
        functionName,
        headers: includeCommands
          ? {
              Authorization: `Bearer $${secretEnv}`,
              "Content-Type": "application/json",
            }
          : null,
        method: "POST",
        secretEnv,
        url: includeCommands ? `$SUPABASE_FUNCTIONS_URL/${functionName}` : null,
      };
    }),
    source: "schedulerPlan",
  };
}

export const runtimeSecretNames = Object.freeze([
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "OGL_LICENSE_SIGNING_KEY",
  "RAWG_API_KEY",
  "PRICE_DROP_NOTIFY_SECRET",
  "ACCOUNT_DELETION_PROCESSOR_SECRET",
  "PRESENCE_POLL_SECRET",
  "STEAM_WEB_API_KEY",
  "PRESENCE_PROVIDER_TOKEN",
]);

const actions = new Set([
  "plan",
  "packet",
  "preflight",
  "deploy",
  "smoke",
  "all",
  "scheduler-packet",
]);

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

const placeholderEnvironmentValues = new Set([
  "-",
  "--",
  "anon",
  "api-key",
  "api_key",
  "dummy",
  "example",
  "jwt",
  "n/a",
  "na",
  "none",
  "null",
  "pending",
  "placeholder",
  "replace-with-random-cron-secret",
  "sample",
  "secret",
  "secret-value",
  "service-secret",
  "set",
  "sk_live_secret",
  "tbd",
  "todo",
  "token",
  "whsec_secret",
  "your-project-ref",
]);

function envValueIsConfigured(value) {
  const cleaned = clean(value);
  if (!cleaned) return false;
  const normalized = cleaned.toLowerCase().replace(/[.!]+$/, "");
  if (placeholderEnvironmentValues.has(normalized)) return false;
  return !/^(?:your|replace|change|insert|paste)[-_ ]/.test(normalized);
}

function configuredEnvValue(value) {
  return envValueIsConfigured(value) ? clean(value) : "";
}

const supabaseAccessTokenPattern = /^sbp_[A-Za-z0-9._~+/=-]{32,}$/;
const cronSmokeSecretPattern = /^[A-Za-z0-9][A-Za-z0-9._~+/=-]{31,}$/;
const weakConfiguredValuePattern = /^configured[-_ ]/i;

function safeSupabaseAccessToken(value) {
  const token = configuredEnvValue(value);
  if (!token) return "";
  if (!supabaseAccessTokenPattern.test(token)) return "";
  return token;
}

function safeCronSmokeSecret(value) {
  const secret = configuredEnvValue(value);
  if (!secret) return "";
  if (weakConfiguredValuePattern.test(secret)) return "";
  if (!cronSmokeSecretPattern.test(secret)) return "";
  return secret;
}

const secretLikeSmokeRunIdPattern =
  /sk_(?:live|test)_|whsec_|bearer\s+[a-z0-9._~+/=-]{12,}|eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}|\b(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY|SUPABASE_AUTH_JWT|PRICE_DROP_NOTIFY_SECRET|ACCOUNT_DELETION_PROCESSOR_SECRET|PRESENCE_POLL_SECRET)\b/i;
const safeSmokeRunIdPattern = /^[a-z0-9][a-z0-9._:-]{2,127}$/i;

function safeSmokeRunId(value) {
  const runId = clean(value);
  if (!runId) return "";
  if (!safeSmokeRunIdPattern.test(runId)) return "";
  if (secretLikeSmokeRunIdPattern.test(runId)) return "";
  return runId;
}

function smokeRunIdValidationError(value) {
  if (typeof value !== "string" || clean(value) === "") {
    return "runId must be present.";
  }
  if (!safeSmokeRunId(value)) {
    return "runId must be a safe evidence identifier.";
  }
  return "";
}

function payloadStorageBucketsMatchExpected(value) {
  if (!Array.isArray(value)) return false;
  if (value.length !== accountDeletionUserStorageBuckets.length) return false;
  const actual = new Set(value);
  if (actual.size !== accountDeletionUserStorageBuckets.length) return false;
  return accountDeletionUserStorageBuckets.every((bucket) =>
    actual.has(bucket),
  );
}

function withoutTrailingSlash(value) {
  return configuredEnvValue(value).replace(/\/+$/, "");
}

function safeProjectRef(value) {
  const projectRef = configuredEnvValue(value);
  if (!/^[a-z0-9]{20}$/.test(projectRef)) return "";
  if (
    /^(?:example|sample|placeholder|test|your-project-ref)$/i.test(projectRef)
  ) {
    return "";
  }
  return projectRef;
}

function safeHostedSupabaseUrl(value, allowedPaths) {
  const baseUrl = withoutTrailingSlash(value);
  if (!baseUrl) return "";
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:") return "";
    if (url.port) return "";
    if (url.username || url.password || url.search || url.hash) return "";
    const projectRef = url.hostname.match(
      /^([a-z0-9]{20})\.supabase\.co$/,
    )?.[1];
    if (!safeProjectRef(projectRef)) return "";
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (!allowedPaths.has(path)) return "";
    url.pathname = path === "/" ? "" : path;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

const hostedProjectRefMatchEnv =
  "SUPABASE_PROJECT_REF/SUPABASE_URL/SUPABASE_FUNCTIONS_URL project ref match";

function projectRefFromHostedSupabaseUrl(value, allowedPaths) {
  const baseUrl = safeHostedSupabaseUrl(value, allowedPaths);
  if (!baseUrl) return "";
  try {
    return (
      new URL(baseUrl).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1] ??
      ""
    );
  } catch {
    return "";
  }
}

function hostedProjectRefsMatch(env = process.env) {
  const refs = [
    safeProjectRef(env.SUPABASE_PROJECT_REF),
    projectRefFromHostedSupabaseUrl(env.SUPABASE_URL, new Set(["/"])),
    projectRefFromHostedSupabaseUrl(
      env.SUPABASE_FUNCTIONS_URL,
      new Set(["/functions/v1"]),
    ),
  ].filter(Boolean);
  return new Set(refs).size <= 1;
}

function safeProjectBaseUrl(value) {
  return safeHostedSupabaseUrl(value, new Set(["/"]));
}

function safeFunctionsBaseUrl(value) {
  return safeHostedSupabaseUrl(value, new Set(["/functions/v1"]));
}

export function parseArgs(argv) {
  const action = argv.find((arg) => !arg.startsWith("-")) ?? "plan";
  if (!actions.has(action)) {
    throw new Error(
      `Unknown hosted deploy gate action. Use one of: ${Array.from(
        actions,
      ).join(", ")}.`,
    );
  }

  return {
    action,
    dryRunDeploy: argv.includes("--dry-run"),
  };
}

export function shouldRunHostedDeploySmoke(action, dryRunDeploy = false) {
  return action === "smoke" || (action === "all" && !dryRunDeploy);
}

export function deriveFunctionsBaseUrl(env = process.env) {
  const explicit = safeFunctionsBaseUrl(env.SUPABASE_FUNCTIONS_URL);
  if (explicit) return explicit;

  const supabaseUrl = safeProjectBaseUrl(env.SUPABASE_URL);
  if (supabaseUrl) return `${supabaseUrl}/functions/v1`;

  const projectRef = safeProjectRef(env.SUPABASE_PROJECT_REF);
  if (projectRef) return `https://${projectRef}.supabase.co/functions/v1`;

  return "";
}

export function getDeployFunctions(env = process.env) {
  const requested = clean(env.OGL_HOSTED_DEPLOY_FUNCTIONS);
  if (!requested) return [...deployFunctions];

  const known = new Map(deployFunctions.map((fn) => [fn.name, fn]));
  return requested
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((name) => {
      const item = known.get(name);
      if (!item) {
        throw new Error("Unknown function in OGL_HOSTED_DEPLOY_FUNCTIONS.");
      }
      return item;
    });
}

function requiredEnvForAction(action) {
  const required = new Set();
  if (action === "preflight" || action === "deploy" || action === "all") {
    required.add("SUPABASE_ACCESS_TOKEN");
    required.add("SUPABASE_PROJECT_REF");
  }
  if (action === "preflight" || action === "smoke" || action === "all") {
    for (const smoke of cronDryRunSmokes) {
      required.add(smoke.secretEnv);
    }
  }
  return [...required];
}

const cronSmokeSecretEnvNames = new Set(
  cronDryRunSmokes.map((smoke) => smoke.secretEnv),
);

function requiredEnvValueIsValid(name, value) {
  if (name === "SUPABASE_ACCESS_TOKEN") {
    return Boolean(safeSupabaseAccessToken(value));
  }
  if (name === "SUPABASE_PROJECT_REF") return Boolean(safeProjectRef(value));
  if (cronSmokeSecretEnvNames.has(name)) return Boolean(safeCronSmokeSecret(value));
  return envValueIsConfigured(value);
}

export function missingRequiredEnv(action, env = process.env) {
  const missing = requiredEnvForAction(action).filter(
    (name) => !requiredEnvValueIsValid(name, env[name]),
  );
  if (
    (action === "preflight" || action === "smoke" || action === "all") &&
    !deriveFunctionsBaseUrl(env)
  ) {
    missing.push(
      "SUPABASE_FUNCTIONS_URL or SUPABASE_URL or SUPABASE_PROJECT_REF",
    );
  }
  if (
    (action === "preflight" || action === "smoke" || action === "all") &&
    !hostedProjectRefsMatch(env)
  ) {
    missing.push(hostedProjectRefMatchEnv);
  }
  return missing;
}

export function buildDeployCommand(functionPlan, env = process.env) {
  const projectRef = safeProjectRef(env.SUPABASE_PROJECT_REF);
  if (!projectRef) {
    throw new Error(
      "Missing required hosted deploy gate env: SUPABASE_PROJECT_REF",
    );
  }
  const args = [
    "--dir",
    "launcher",
    "exec",
    "supabase",
    "functions",
    "deploy",
    functionPlan.name,
    "--project-ref",
    projectRef,
  ];
  if (functionPlan.verifyJwt === false) {
    args.push("--no-verify-jwt");
  }
  return { args, command: "pnpm" };
}

export function parseSupabaseFunctionVerifyJwtConfig(configText) {
  const entries = new Map();
  let currentFunction = null;
  const lines = String(configText ?? "").split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    const sectionMatch = trimmed.match(/^\[functions\.([a-z0-9-]+)\]$/i);
    if (sectionMatch) {
      currentFunction = sectionMatch[1];
      if (!entries.has(currentFunction)) {
        entries.set(currentFunction, {
          location: `supabase/config.toml:${index + 1}`,
          verifyJwt: null,
        });
      }
      continue;
    }
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      currentFunction = null;
      continue;
    }
    if (!currentFunction) continue;

    const verifyJwtMatch = trimmed.match(/^verify_jwt\s*=\s*(true|false)\b/i);
    if (verifyJwtMatch) {
      entries.set(currentFunction, {
        location: `supabase/config.toml:${index + 1}`,
        verifyJwt: verifyJwtMatch[1].toLowerCase() === "true",
      });
    }
  }

  return entries;
}

export function validateSupabaseFunctionVerifyJwtConfig(
  configText,
  functionPlan = deployFunctions,
) {
  const entries = parseSupabaseFunctionVerifyJwtConfig(configText);
  const errors = [];

  for (const fn of functionPlan) {
    const entry = entries.get(fn.name);
    if (!entry) {
      errors.push(
        `Supabase config missing [functions.${fn.name}] verify_jwt = ${fn.verifyJwt ? "true" : "false"}.`,
      );
      continue;
    }
    if (typeof entry.verifyJwt !== "boolean") {
      errors.push(
        `Supabase config [functions.${fn.name}] is missing an explicit verify_jwt value.`,
      );
      continue;
    }
    if (entry.verifyJwt !== fn.verifyJwt) {
      errors.push(
        `Supabase config [functions.${fn.name}] verify_jwt=${entry.verifyJwt} does not match deploy plan verify_jwt=${fn.verifyJwt}.`,
      );
    }
  }

  return { entries, errors };
}

export function runVerifyJwtConfigPreflight(
  configText = readFileSync(
    new URL("../supabase/config.toml", import.meta.url),
    "utf8",
  ),
  functionPlan = deployFunctions,
) {
  const result = validateSupabaseFunctionVerifyJwtConfig(
    configText,
    functionPlan,
  );
  if (result.errors.length > 0) {
    throw new Error(
      `Supabase function verify_jwt config preflight failed: ${result.errors.join(" ")}`,
    );
  }
  return { checked: functionPlan.length };
}

function addRuntimeSecretName(names, value) {
  const name = clean(value);
  if (!/^[A-Z][A-Z0-9_]{1,127}$/.test(name)) return;
  if (name === "NAME") return;
  names.add(name);
}

export function parseSupabaseRuntimeSecretNames(output) {
  const text = String(output ?? "");
  const names = new Set();

  try {
    const parsed = JSON.parse(text);
    const items = Array.isArray(parsed) ? parsed : parsed?.secrets;
    if (Array.isArray(items)) {
      for (const item of items) {
        addRuntimeSecretName(names, item?.name ?? item?.Name);
      }
    }
  } catch {
    // Fall back to Supabase CLI table/env output below.
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^[-+| ]+$/.test(trimmed)) continue;
    if (/^name\b/i.test(trimmed)) continue;

    const envMatch = trimmed.match(/^([A-Z][A-Z0-9_]{1,127})\s*=/);
    if (envMatch) {
      addRuntimeSecretName(names, envMatch[1]);
      continue;
    }

    const tableMatch = trimmed.match(
      /^\|?\s*([A-Z][A-Z0-9_]{1,127})(?=\s*(?:\||\s{2,}|$))/,
    );
    if (tableMatch) {
      addRuntimeSecretName(names, tableMatch[1]);
    }
  }

  return [...names].sort();
}

export function missingRuntimeSecretNames(
  actualNames,
  expectedNames = runtimeSecretNames,
) {
  const actual = new Set(actualNames);
  return expectedNames.filter((name) => !actual.has(name));
}

export function runRuntimeSecretsPreflight(
  env = process.env,
  spawnImpl = spawnSync,
) {
  const missingEnv = [];
  if (!safeSupabaseAccessToken(env.SUPABASE_ACCESS_TOKEN)) {
    missingEnv.push("SUPABASE_ACCESS_TOKEN");
  }
  if (!safeProjectRef(env.SUPABASE_PROJECT_REF)) {
    missingEnv.push("SUPABASE_PROJECT_REF");
  }
  if (missingEnv.length > 0) {
    throw new Error(
      `Missing required hosted deploy gate env: ${missingEnv.join(", ")}`,
    );
  }

  const result = spawnImpl(
    "pnpm",
    [
      "--dir",
      "launcher",
      "exec",
      "supabase",
      "secrets",
      "list",
      "--project-ref",
      clean(env.SUPABASE_PROJECT_REF),
    ],
    {
      encoding: "utf8",
      env,
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error("Supabase runtime secrets name preflight failed.");
  }

  const foundNames = parseSupabaseRuntimeSecretNames(result.stdout);
  const missing = missingRuntimeSecretNames(foundNames);
  if (missing.length > 0) {
    throw new Error(
      `Missing Supabase runtime secret names: ${missing.join(", ")}`,
    );
  }

  return { checked: runtimeSecretNames.length };
}

export function validateSmokePayload(functionName, payload) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [`${functionName} did not return a JSON object.`];
  }

  if (functionName === "process-account-deletions") {
    if (payload.dryRun !== true) errors.push("dryRun must be true.");
    if (payload.processedCount !== 0) errors.push("processedCount must be 0.");
    if (payload.failedCount !== 0) errors.push("failedCount must be 0.");
    if (!Array.isArray(payload.processed) || payload.processed.length !== 0) {
      errors.push("processed must be an empty array.");
    }
    if (!Array.isArray(payload.storageBuckets)) {
      errors.push("storageBuckets must be present.");
    } else if (!payloadStorageBucketsMatchExpected(payload.storageBuckets)) {
      errors.push(
        "storageBuckets must list all account deletion user storage buckets.",
      );
    }
    if (payload.evidenceRecorded !== true) {
      errors.push("evidenceRecorded must be true.");
    }
    const runIdError = smokeRunIdValidationError(payload.runId);
    if (runIdError) errors.push(runIdError);
    if (payload.triggerSource !== "hosted_deploy_gate") {
      errors.push("triggerSource must be hosted_deploy_gate.");
    }
  }

  if (functionName === "notify-price-drop") {
    if (payload.dryRun !== true) errors.push("dryRun must be true.");
    if (payload.deliveryMode !== "dry_run")
      errors.push("deliveryMode must be dry_run.");
    if (payload.notificationsRecorded !== 0) {
      errors.push("notificationsRecorded must be 0.");
    }
    if (payload.alertsMarked !== 0) errors.push("alertsMarked must be 0.");
    if (payload.evidenceRecorded !== true) {
      errors.push("evidenceRecorded must be true.");
    }
    const runIdError = smokeRunIdValidationError(payload.runId);
    if (runIdError) errors.push(runIdError);
    if (payload.triggerSource !== "hosted_deploy_gate") {
      errors.push("triggerSource must be hosted_deploy_gate.");
    }
  }

  if (functionName === "poll-platform-presence") {
    if (payload.dryRun !== true) errors.push("dryRun must be true.");
    if (payload.presenceUpdated !== 0)
      errors.push("presenceUpdated must be 0.");
    if (payload.activityInserted !== 0)
      errors.push("activityInserted must be 0.");
    if (payload.evidenceRecorded !== true) {
      errors.push("evidenceRecorded must be true.");
    }
    const runIdError = smokeRunIdValidationError(payload.runId);
    if (runIdError) errors.push(runIdError);
    if (payload.triggerSource !== "hosted_deploy_gate") {
      errors.push("triggerSource must be hosted_deploy_gate.");
    }
  }

  return errors;
}

function functionUrl(baseUrl, name) {
  return `${withoutTrailingSlash(baseUrl)}/${name}`;
}

export function summarizePayload(payload) {
  const summaryKeys = [
    "dryRun",
    "deliveryMode",
    "evidenceRecorded",
    "candidateCount",
    "scanned",
    "skipped",
    "processedCount",
    "wouldProcess",
    "polled",
    "presenceUpdated",
    "activityInserted",
    "runId",
    "triggerSource",
  ];
  const summary = {};
  for (const key of summaryKeys) {
    if (payload && typeof payload === "object" && key in payload) {
      if (key === "runId") {
        summary[key] =
          safeSmokeRunId(payload[key]) || "[redacted-invalid-run-id]";
      } else {
        summary[key] = Array.isArray(payload[key])
          ? payload[key].length
          : payload[key];
      }
    }
  }
  return summary;
}

function summarizeErrorPayload(payload) {
  if (!payload) return "empty response body";
  if (Array.isArray(payload)) return `JSON array length ${payload.length}`;
  if (typeof payload === "object") {
    const keys = Object.keys(payload).sort();
    return `JSON object keys: ${keys.slice(0, 12).join(", ") || "none"}`;
  }
  return "response body redacted";
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function validateOptionsSmokeCorsHeaders(headers, expectedOrigin) {
  const errors = [];
  const allowOrigin = clean(headers.get("access-control-allow-origin"));
  if (!allowOrigin) {
    errors.push("Access-Control-Allow-Origin must be present.");
  } else if (allowOrigin !== "*" && allowOrigin !== expectedOrigin) {
    errors.push("Access-Control-Allow-Origin must be * or OGL_HOSTED_SMOKE_ORIGIN.");
  }

  const allowMethods = clean(headers.get("access-control-allow-methods"));
  if (allowMethods) {
    const methods = allowMethods
      .split(",")
      .map((method) => method.trim().toUpperCase())
      .filter(Boolean);
    if (!methods.includes("OPTIONS")) {
      errors.push("Access-Control-Allow-Methods must include OPTIONS.");
    }
  }

  return errors;
}

export async function runCronDryRunSmoke(
  smoke,
  env = process.env,
  fetchImpl = fetch,
) {
  const baseUrl = deriveFunctionsBaseUrl(env);
  const secret = safeCronSmokeSecret(env[smoke.secretEnv]);
  const missing = [];
  if (!baseUrl) {
    missing.push(
      "SUPABASE_FUNCTIONS_URL or SUPABASE_URL or SUPABASE_PROJECT_REF",
    );
  }
  if (!secret) {
    missing.push(smoke.secretEnv);
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required hosted deploy gate env: ${missing.join(", ")}`,
    );
  }
  const response = await fetchImpl(functionUrl(baseUrl, smoke.name), {
    body: JSON.stringify(smoke.body),
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(
      `${smoke.name} dry-run smoke failed with HTTP ${response.status} (${summarizeErrorPayload(
        payload,
      )})`,
    );
  }

  const validationErrors = validateSmokePayload(smoke.name, payload);
  if (validationErrors.length > 0) {
    throw new Error(
      `${smoke.name} dry-run smoke failed: ${validationErrors.join(" ")}`,
    );
  }

  return {
    name: smoke.name,
    status: response.status,
    summary: summarizePayload(payload),
    type: "cron-dry-run",
  };
}

export async function runOptionsSmoke(
  smoke,
  env = process.env,
  fetchImpl = fetch,
) {
  if (!hostedProjectRefsMatch(env)) {
    throw new Error(
      `Missing required hosted deploy gate env: ${hostedProjectRefMatchEnv}`,
    );
  }
  const baseUrl = deriveFunctionsBaseUrl(env);
  const headers = {};
  const origin = clean(env.OGL_HOSTED_SMOKE_ORIGIN);
  if (origin) headers.Origin = origin;
  const response = await fetchImpl(functionUrl(baseUrl, smoke.name), {
    headers,
    method: "OPTIONS",
  });
  const payload = await readJsonResponse(response);
  if (response.status !== 200) {
    throw new Error(
      `${smoke.name} OPTIONS smoke failed with HTTP ${response.status} (${summarizeErrorPayload(
        payload,
      )})`,
    );
  }
  const corsErrors = validateOptionsSmokeCorsHeaders(response.headers, origin);
  if (corsErrors.length > 0) {
    throw new Error(
      `${smoke.name} OPTIONS smoke failed: ${corsErrors.join(" ")}`,
    );
  }

  return {
    name: smoke.name,
    status: response.status,
    summary: {},
    type: "options",
  };
}

function printPlan(env = process.env) {
  const functions = getDeployFunctions(env);
  const baseUrl = deriveFunctionsBaseUrl(env)
    ? "configured"
    : "(set SUPABASE_URL/SUPABASE_PROJECT_REF)";

  console.log("Hosted deploy gate plan");
  console.log("");
  console.log(`Function base URL: ${baseUrl}`);
  console.log("");
  console.log("Deploy functions:");
  for (const fn of functions) {
    console.log(`- ${fn.name} (verify_jwt=${fn.verifyJwt ? "true" : "false"})`);
  }
  console.log("");
  console.log("Non-mutating smoke checks:");
  for (const smoke of cronDryRunSmokes) {
    console.log(`- ${smoke.name}: POST dry-run using ${smoke.secretEnv}`);
  }
  for (const smoke of optionsSmokes) {
    console.log(`- ${smoke.name}: OPTIONS module/env sanity`);
  }
  console.log("");
  console.log("Scheduler handoff after smoke passes:");
  for (const item of schedulerPlan) {
    console.log(
      `- ${item.functionName}: ${item.cadence}, Authorization: Bearer $${
        item.secretEnv
      }, body ${JSON.stringify(item.body)}`,
    );
  }
}

export function hostedDeployGatePacket(env = process.env) {
  const functions = getDeployFunctions(env);
  const baseUrlState = deriveFunctionsBaseUrl(env)
    ? "configured"
    : "(set SUPABASE_URL/SUPABASE_PROJECT_REF)";
  const preflightMissing = missingRequiredEnv("preflight", env);
  const deployMissing = missingRequiredEnv("deploy", env);
  const smokeMissing = missingRequiredEnv("smoke", env);
  const schedulerPacket = buildSchedulerPacket(schedulerPlan, env);
  const lines = [
    "Hosted deploy gate operator packet",
    "",
    `Function base URL: ${baseUrlState}`,
    `Deploy functions: ${functions.length}/${deployFunctions.length} selected`,
    `Preflight env: ${
      preflightMissing.length === 0 ? "configured" : "missing"
    }`,
    `Deploy env: ${deployMissing.length === 0 ? "configured" : "missing"}`,
    `Smoke env: ${smokeMissing.length === 0 ? "configured" : "missing"}`,
    "",
    "This packet is redacted and non-mutating. It lists environment names, function names, deploy flags, smoke payload shapes, runtime secret names, and scheduler handoff commands only; it does not print secret values, deploy functions, call hosted functions, create schedulers, or prove external success.",
    "",
    "## Missing Environment Names",
    "",
    `- preflight: ${preflightMissing.length === 0 ? "none" : preflightMissing.join("; ")}`,
    `- deploy: ${deployMissing.length === 0 ? "none" : deployMissing.join("; ")}`,
    `- smoke: ${smokeMissing.length === 0 ? "none" : smokeMissing.join("; ")}`,
    "",
    "## Runtime Secret Names Checked By Preflight",
    "",
    ...runtimeSecretNames.map((name) => `- ${name}`),
    "",
    "## Deploy Functions",
    "",
    ...functions.map(
      (fn) => `- ${fn.name} (verify_jwt=${fn.verifyJwt ? "true" : "false"})`,
    ),
    "",
    "## Non-Mutating Smoke Plan",
    "",
    ...cronDryRunSmokes.map(
      (smoke) =>
        `- ${smoke.name}: POST dry-run using ${smoke.secretEnv}, body ${JSON.stringify(
          smoke.body,
        )}`,
    ),
    ...optionsSmokes.map(
      (smoke) => `- ${smoke.name}: OPTIONS module/env sanity`,
    ),
    "",
    "## Scheduler Handoff",
    "",
    schedulerPacket.disclaimer,
    "",
    `Scheduler base URL state: ${schedulerPacket.baseUrlSetup.state}`,
    `- target env: ${schedulerPacket.baseUrlSetup.targetEnv}`,
    `- source env: ${schedulerPacket.baseUrlSetup.sourceEnv ?? "none"}`,
    `- setup: ${schedulerPacket.baseUrlSetup.setupCommand}`,
    `- missing env: ${
      schedulerPacket.baseUrlSetup.missingEnv.length === 0
        ? "none"
        : schedulerPacket.baseUrlSetup.missingEnv.join("; ")
    }`,
    "",
    ...schedulerPacket.items.map(
      (item) =>
        `- ${item.functionName}: ${item.cadence}, Authorization: Bearer $${item.secretEnv}, body ${item.bodyJson}`,
    ),
    "",
    "## GitHub Workflow Dispatch",
    "",
    "- Open GitHub Actions -> CI -> Run workflow.",
    "- Use branch `main` for hosted production proof.",
    "- Set `hosted_deploy_gate=true`.",
    "- Set `hosted_environment=hosted-production` for production proof.",
    "- Set `hosted_deploy_action=all` for deploy plus smoke proof.",
    "- Set `hosted_deploy_dry_run=false` for proof; dry-run only rehearses command wiring.",
    "",
    "## Next Commands",
    "",
    "- `pnpm hosted:deploy-gate preflight` runs the hosted deploy preflight.",
    "- `pnpm hosted:deploy-gate:scheduler-packet` prints only scheduler handoff JSON.",
    "- `pnpm hosted:cron-evidence:packet` validates hosted scheduler rows after real schedules run.",
    "- `pnpm completion:gate:external` remains the release-boundary check.",
  ];

  return lines.join("\n");
}

function printSchedulerPacket() {
  console.log(JSON.stringify(buildSchedulerPacket(), null, 2));
}

function printHostedDeployGatePacket(env = process.env) {
  console.log(hostedDeployGatePacket(env));
}

function assertEnv(action, env = process.env) {
  const missing = missingRequiredEnv(action, env);
  if (missing.length > 0) {
    throw new Error(
      `Missing required hosted deploy gate env: ${missing.join(", ")}`,
    );
  }
}

function runDeploy(env = process.env, dryRunDeploy = false) {
  assertEnv("deploy", env);
  for (const fn of getDeployFunctions(env)) {
    const { command, args } = buildDeployCommand(fn, env);
    console.log(`$ ${command} ${args.join(" ")}`);
    if (dryRunDeploy) continue;
    const result = spawnSync(command, args, {
      env,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      throw new Error(
        `${fn.name} deploy failed with exit code ${result.status ?? "unknown"}`,
      );
    }
  }
}

async function runSmoke(env = process.env) {
  assertEnv("smoke", env);
  const results = [];
  for (const smoke of cronDryRunSmokes) {
    const result = await runCronDryRunSmoke(smoke, env);
    results.push(result);
    console.log(
      `ok ${result.type} ${result.name} ${JSON.stringify(result.summary)}`,
    );
  }
  for (const smoke of optionsSmokes) {
    const result = await runOptionsSmoke(smoke, env);
    results.push(result);
    console.log(`ok ${result.type} ${result.name}`);
  }
  writeStepSummary(results);
}

function writeStepSummary(results) {
  const summaryPath = clean(process.env.GITHUB_STEP_SUMMARY);
  if (!summaryPath) return;
  const lines = [
    "## Hosted Deploy Gate",
    "",
    "| Check | Type | Status | Summary |",
    "| --- | --- | --- | --- |",
    ...results.map(
      (result) =>
        `| \`${result.name}\` | ${result.type} | ${result.status} | \`${JSON.stringify(
          result.summary,
        )}\` |`,
    ),
    "",
  ];
  appendFileSync(summaryPath, `${lines.join("\n")}\n`);
}

async function main() {
  const { action, dryRunDeploy } = parseArgs(process.argv.slice(2));
  if (action === "packet") {
    printHostedDeployGatePacket();
    return;
  }
  if (action === "scheduler-packet") {
    printSchedulerPacket();
    return;
  }

  printPlan();

  if (action === "plan") return;
  assertEnv(action);
  console.log("");
  console.log(`Preflight OK for action: ${action}`);

  if (action === "preflight" || action === "all") {
    const configResult = runVerifyJwtConfigPreflight();
    console.log(
      `Supabase function verify_jwt config OK (${configResult.checked} checked)`,
    );
    const result = runRuntimeSecretsPreflight();
    console.log(`Supabase runtime secret names OK (${result.checked} checked)`);
  }

  if (action === "deploy" || action === "all") {
    if (action === "deploy") {
      const configResult = runVerifyJwtConfigPreflight();
      console.log(
        `Supabase function verify_jwt config OK (${configResult.checked} checked)`,
      );
    }
    runDeploy(process.env, dryRunDeploy);
  }
  if (shouldRunHostedDeploySmoke(action, dryRunDeploy)) {
    await runSmoke();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
