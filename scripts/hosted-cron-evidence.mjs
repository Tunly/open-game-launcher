#!/usr/bin/env node
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const restBaseUrlRequirement =
  "SUPABASE_REST_URL or SUPABASE_URL or SUPABASE_PROJECT_REF";
const missingRestBaseUrlLabel = `(set ${restBaseUrlRequirement})`;
const restAuthProjectRefMatchRequirement =
  "SUPABASE_REST_URL/SUPABASE_URL/SUPABASE_PROJECT_REF must match REST auth project ref";
const jwtClockSkewSeconds = 300;

export const cronEvidenceChecks = Object.freeze([
  {
    defaultFreshnessHours: 25,
    id: "price-drop",
    functionName: "notify-price-drop",
    table: "store_price_drop_notification_runs",
    select: [
      "run_id",
      "trigger_source",
      "dry_run",
      "limit_count",
      "requested_alert_count",
      "requested_product_count",
      "requested_user_count",
      "scanned_count",
      "candidate_count",
      "notifications_recorded_count",
      "alerts_marked_count",
      "skipped_summary",
      "completed_at",
      "status",
    ],
  },
  {
    defaultFreshnessHours: 0.25,
    id: "presence-poll",
    functionName: "poll-platform-presence",
    table: "presence_poll_runs",
    select: [
      "run_id",
      "trigger_source",
      "dry_run",
      "forced",
      "platforms",
      "requested_user_count",
      "scanned_count",
      "polled_count",
      "presence_updated_count",
      "activity_inserted_count",
      "skipped_count",
      "skipped_summary",
      "provider_result_summary",
      "completed_at",
      "status",
    ],
  },
  {
    defaultFreshnessHours: 25,
    id: "account-deletion",
    functionName: "process-account-deletions",
    table: "account_deletion_processor_runs",
    select: [
      "run_id",
      "trigger_source",
      "dry_run",
      "limit_count",
      "due_request_count",
      "would_process_count",
      "claimed_count",
      "skipped_count",
      "completed_count",
      "failed_count",
      "storage_bucket_count",
      "skipped_summary",
      "completed_at",
      "status",
    ],
  },
]);

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

const placeholderEnvironmentValues = new Set([
  "-",
  "--",
  "dummy",
  "example",
  "n/a",
  "na",
  "none",
  "null",
  "pending",
  "placeholder",
  "replace-me",
  "sample",
  "tbd",
  "todo",
  "api-key",
  "api_key",
  "anon",
  "jwt",
  "secret",
  "secret-value",
  "service-secret",
  "set",
  "sk_live_secret",
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

function readJwtJsonPart(part) {
  if (!/^[a-zA-Z0-9_-]+$/.test(part)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function supabaseProjectRefFromJwtPayload(payload) {
  const ref = safeProjectRef(payload.ref);
  const issuer = clean(payload.iss).toLowerCase().replace(/\/+$/, "");
  if (issuer === "supabase") return ref;

  const issuerProjectRef = issuer.match(
    /^https:\/\/([a-z0-9]{20})\.supabase\.co\/auth\/v1$/,
  )?.[1];
  const refs = [ref, safeProjectRef(issuerProjectRef)].filter(Boolean);
  const uniqueRefs = [...new Set(refs)];
  if (uniqueRefs.length !== 1) return "";

  return uniqueRefs[0];
}

function jwtTimestampClaimSeconds(payload, claim) {
  if (!Object.prototype.hasOwnProperty.call(payload, claim)) {
    return { present: false, valid: true, value: 0 };
  }
  const value = payload[claim];
  if (!Number.isInteger(value) || value < 0) {
    return { present: true, valid: false, value: 0 };
  }
  return { present: true, valid: true, value };
}

function jwtTimeWindowIsValid(payload, now = new Date()) {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (!Number.isFinite(nowSeconds)) return false;

  const exp = jwtTimestampClaimSeconds(payload, "exp");
  if (exp.present) {
    if (!exp.valid) return false;
    if (exp.value + jwtClockSkewSeconds < nowSeconds) return false;
  }

  const nbf = jwtTimestampClaimSeconds(payload, "nbf");
  if (nbf.present) {
    if (!nbf.valid) return false;
    if (nbf.value - jwtClockSkewSeconds > nowSeconds) return false;
  }

  return true;
}

function safeSupabaseJwtDetails(value, { requiredRole = "", now } = {}) {
  const jwt = configuredEnvValue(value);
  if (!jwt) return null;

  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;
  if (!signaturePart || signaturePart.length < 16) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(signaturePart)) return null;

  const header = readJwtJsonPart(headerPart);
  const payload = readJwtJsonPart(payloadPart);
  if (!header || !payload) return null;

  const algorithm = clean(header.alg).toLowerCase();
  const tokenType = clean(header.typ).toLowerCase();
  if (!algorithm || algorithm === "none") return null;
  if (tokenType && tokenType !== "jwt") return null;

  const role = clean(payload.role).toLowerCase();
  if (!role) return null;
  if (requiredRole && role !== requiredRole) return null;
  if (!jwtTimeWindowIsValid(payload, now)) return null;

  const projectRef = supabaseProjectRefFromJwtPayload(payload);
  if (!projectRef) return null;

  return { jwt, projectRef };
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

function safeHostedSupabaseUrl(value, { requiredPath = "" } = {}) {
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
    const path = url.pathname.replace(/\/+$/, "");
    if (requiredPath && path !== requiredPath) return "";
    if (!requiredPath && path !== "") return "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function safeRestBaseUrl(value) {
  return safeHostedSupabaseUrl(value, { requiredPath: "/rest/v1" });
}

function safeProjectBaseUrl(value) {
  return safeHostedSupabaseUrl(value);
}

function projectRefFromSafeHostedUrl(value) {
  try {
    return (
      new URL(value).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1] ?? ""
    );
  } catch {
    return "";
  }
}

function restTargetProjectRefs(env = process.env) {
  return [
    projectRefFromSafeHostedUrl(safeRestBaseUrl(env.SUPABASE_REST_URL)),
    projectRefFromSafeHostedUrl(safeProjectBaseUrl(env.SUPABASE_URL)),
    safeProjectRef(env.SUPABASE_PROJECT_REF),
  ].filter(Boolean);
}

function uniqueRestTargetProjectRefs(env = process.env) {
  return [...new Set(restTargetProjectRefs(env))];
}

const secretLikeEvidenceValuePattern =
  /(?:sk|rk)_(?:live|test)_|whsec_|bearer\s+[a-z0-9._~+/=-]{12,}|eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}|\b(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY|SUPABASE_AUTH_JWT|PRICE_DROP_NOTIFY_SECRET|ACCOUNT_DELETION_PROCESSOR_SECRET|PRESENCE_POLL_SECRET)\b/i;
const safeRunIdPattern = /^[a-z0-9][a-z0-9._:-]{2,127}$/i;
const uuidRunIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const specificRunIdTokenPattern =
  /\b(?:run|run_id|probe|session|workflow|deployment|deploy|log|event|artifact|ticket|build)[-_: #]?[a-z0-9][a-z0-9._:-]{2,}\b/i;
const hostedCronLaneRunIdPattern =
  /(?:price[-_.:\s]?drop|notify[-_.:\s]?price[-_.:\s]?drop|presence[-_.:\s]?poll|poll[-_.:\s]?platform[-_.:\s]?presence|account[-_.:\s]?deletion|process[-_.:\s]?account[-_.:\s]?deletions?)/i;

export function accountDeletionStorageBucketCountFromContractSource(source) {
  const match = String(source).match(
    /ACCOUNT_DELETION_USER_STORAGE_BUCKETS\s*=\s*\[([\s\S]*?)\];/,
  );
  if (!match) {
    throw new Error("ACCOUNT_DELETION_USER_STORAGE_BUCKETS not found.");
  }
  return [...match[1].matchAll(/"[^"]+"/g)].length;
}

export function accountDeletionStorageBucketCountFromContract(root = repoRoot) {
  return accountDeletionStorageBucketCountFromContractSource(
    readFileSync(
      join(
        root,
        "supabase",
        "functions",
        "process-account-deletions",
        "contract.ts",
      ),
      "utf8",
    ),
  );
}

export const expectedAccountDeletionStorageBucketCount =
  accountDeletionStorageBucketCountFromContract();

function parseCheckIds(value) {
  return clean(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCliArgs(argv) {
  const positional = [];
  let checks = "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--checks") {
      const value = argv[index + 1] ?? "";
      if (!clean(value) || value.startsWith("-")) {
        throw new Error("Missing hosted cron evidence check list.");
      }
      if (checks) {
        throw new Error("Expected at most one hosted cron evidence check list.");
      }
      checks = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--checks=")) {
      const value = arg.slice("--checks=".length);
      if (!clean(value)) {
        throw new Error("Missing hosted cron evidence check list.");
      }
      if (checks) {
        throw new Error("Expected at most one hosted cron evidence check list.");
      }
      checks = value;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(
        'Unknown hosted cron evidence option. Use "plan", "check", "artifact-hints", or "packet".',
      );
    }
    positional.push(arg);
  }

  if (positional.length > 1) {
    throw new Error("Expected at most one hosted cron evidence action.");
  }

  return { action: positional[0] ?? "check", checks };
}

export function selectedCronEvidenceChecks(env = process.env, requested = "") {
  const source = requested || env.OGL_HOSTED_CRON_EVIDENCE_CHECKS;
  const ids = parseCheckIds(source);
  if (clean(source) && ids.length === 0) {
    throw new Error(
      "OGL_HOSTED_CRON_EVIDENCE_CHECKS must include at least one check.",
    );
  }
  if (ids.length === 0) return [...cronEvidenceChecks];
  const duplicateRequested = ids.some((id, index) => ids.indexOf(id) !== index);
  if (duplicateRequested) {
    throw new Error(
      "OGL_HOSTED_CRON_EVIDENCE_CHECKS must not include duplicate checks.",
    );
  }

  const known = new Map(cronEvidenceChecks.map((check) => [check.id, check]));
  return ids.map((id) => {
    const check = known.get(id);
    if (!check) {
      throw new Error(
        `Unknown hosted cron evidence check. Use one of: ${Array.from(
          known.keys(),
        ).join(", ")}.`,
      );
    }
    return check;
  });
}

export function parseArgs(argv) {
  const { action, checks } = parseCliArgs(argv);
  if (
    action !== "check" &&
    action !== "plan" &&
    action !== "artifact-hints" &&
    action !== "packet"
  ) {
    throw new Error(
      'Unknown hosted cron evidence action. Use "plan", "check", "artifact-hints", or "packet".',
    );
  }
  return { action, checks };
}

function freshnessHoursForCheck(check, env = process.env) {
  const value = Number(
    clean(env.OGL_HOSTED_CRON_FRESHNESS_HOURS) ||
      check?.defaultFreshnessHours ||
      "25",
  );
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      "OGL_HOSTED_CRON_FRESHNESS_HOURS must be a positive number.",
    );
  }
  return value;
}

export function freshnessMs(env = process.env, check = null) {
  return freshnessHoursForCheck(check, env) * 60 * 60 * 1000;
}

export function deriveRestBaseUrl(env = process.env) {
  const explicit = safeRestBaseUrl(env.SUPABASE_REST_URL);
  if (explicit) return explicit;

  const supabaseUrl = safeProjectBaseUrl(env.SUPABASE_URL);
  if (supabaseUrl) return `${supabaseUrl}/rest/v1`;

  const projectRef = safeProjectRef(env.SUPABASE_PROJECT_REF);
  if (projectRef) return `https://${projectRef}.supabase.co/rest/v1`;

  return "";
}

export function restAuth(env = process.env) {
  const serviceRoleKey = safeSupabaseJwtDetails(env.SUPABASE_SERVICE_ROLE_KEY, {
    requiredRole: "service_role",
  });
  if (serviceRoleKey) {
    return {
      apiKey: serviceRoleKey.jwt,
      bearer: serviceRoleKey.jwt,
      projectRefs: [serviceRoleKey.projectRef],
    };
  }

  const anonKey = safeSupabaseJwtDetails(env.SUPABASE_ANON_KEY, {
    requiredRole: "anon",
  });
  const authJwt = safeSupabaseJwtDetails(env.SUPABASE_AUTH_JWT, {
    requiredRole: "authenticated",
  });
  if (anonKey && authJwt) {
    return {
      apiKey: anonKey.jwt,
      bearer: authJwt.jwt,
      projectRefs: [anonKey.projectRef, authJwt.projectRef],
    };
  }

  return null;
}

function restAuthMatchesRestTarget(env = process.env, auth = restAuth(env)) {
  const targetRefs = uniqueRestTargetProjectRefs(env);
  if (targetRefs.length !== 1) return false;

  const authRefs = [...new Set(auth?.projectRefs ?? [])];
  if (authRefs.length === 0) return false;

  return authRefs.every((projectRef) => projectRef === targetRefs[0]);
}

export function missingRequiredEnv(env = process.env) {
  const missing = [];
  const restBaseUrl = deriveRestBaseUrl(env);
  const auth = restAuth(env);
  if (!restBaseUrl) {
    missing.push("SUPABASE_REST_URL or SUPABASE_URL or SUPABASE_PROJECT_REF");
  }
  if (!auth) {
    missing.push(
      "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY + SUPABASE_AUTH_JWT",
    );
  }
  if (restBaseUrl && auth && !restAuthMatchesRestTarget(env, auth)) {
    missing.push(restAuthProjectRefMatchRequirement);
  }
  return missing;
}

export function buildLatestScheduledRunUrl(check, env = process.env) {
  const url = new URL(`${deriveRestBaseUrl(env)}/${check.table}`);
  url.searchParams.set("select", check.select.join(","));
  url.searchParams.set("trigger_source", "eq.scheduled");
  url.searchParams.set("order", "completed_at.desc");
  url.searchParams.set("limit", "1");
  return url.toString();
}

function isCountKey(key) {
  return (
    key.endsWith("_count") ||
    key === "polled_count" ||
    key === "presence_updated_count" ||
    key === "activity_inserted_count" ||
    key === "notifications_recorded_count" ||
    key === "alerts_marked_count" ||
    key === "failed_count" ||
    key === "completed_count" ||
    key === "scanned_count" ||
    key === "skipped_count"
  );
}

function evidenceCount(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

function pickCounts(row) {
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    if (!isCountKey(key)) continue;
    const count = evidenceCount(value);
    if (count !== null) result[key] = count;
  }
  return result;
}

function hasCounts(counts, keys) {
  return keys.every((key) => key in counts);
}

function addGreaterThanError(errors, counts, leftKey, rightKey) {
  if (!hasCounts(counts, [leftKey, rightKey])) return;
  if (counts[leftKey] > counts[rightKey]) {
    errors.push(`${leftKey} is greater than ${rightKey}.`);
  }
}

function addSumMismatchError(errors, counts, leftKeys, rightKey) {
  if (!hasCounts(counts, [...leftKeys, rightKey])) return;
  const total = leftKeys.reduce((sum, key) => sum + counts[key], 0);
  if (total !== counts[rightKey]) {
    errors.push(`${leftKeys.join(" + ")} does not equal ${rightKey}.`);
  }
}

function readRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function readSummaryTotal(summary) {
  const record = readRecord(summary);
  if (!record) return null;
  if ("total" in record) return evidenceCount(record.total);

  let total = 0;
  for (const value of Object.values(record)) {
    const count = evidenceCount(value);
    if (count === null) return null;
    total += count;
  }
  return total;
}

function addSummaryTotalMismatchError(
  errors,
  summaryTotal,
  count,
  summaryKey,
  countKey,
) {
  if (summaryTotal === null) {
    errors.push(`${summaryKey} is invalid.`);
    return;
  }
  if (count === undefined) return;
  if (summaryTotal !== count) {
    const summaryLabel = summaryKey.endsWith(".total")
      ? summaryKey
      : `${summaryKey} total`;
    errors.push(`${summaryLabel} does not equal ${countKey}.`);
  }
}

function addCountRelationshipErrors(check, row, counts, errors) {
  if (check.id === "price-drop") {
    const skippedTotal = readSummaryTotal(row.skipped_summary);
    addGreaterThanError(errors, counts, "scanned_count", "limit_count");
    addGreaterThanError(errors, counts, "candidate_count", "scanned_count");
    addSummaryTotalMismatchError(
      errors,
      skippedTotal,
      counts.scanned_count === undefined || counts.candidate_count === undefined
        ? undefined
        : counts.scanned_count - counts.candidate_count,
      "skipped_summary",
      "scanned_count - candidate_count",
    );
    addSumMismatchError(
      errors,
      counts,
      ["notifications_recorded_count"],
      "candidate_count",
    );
    addSumMismatchError(
      errors,
      counts,
      ["alerts_marked_count"],
      "candidate_count",
    );
    const inactiveSkips = readRecord(row.skipped_summary)?.inactive;
    const inactiveSkipCount = evidenceCount(inactiveSkips);
    if (inactiveSkips === undefined || inactiveSkipCount === null) {
      errors.push("skipped_summary.inactive missing or invalid.");
    } else if (inactiveSkipCount > 0) {
      errors.push("skipped_summary.inactive is greater than 0.");
    }
    return;
  }

  if (check.id === "presence-poll") {
    addSumMismatchError(
      errors,
      counts,
      ["polled_count", "skipped_count"],
      "scanned_count",
    );
    addGreaterThanError(
      errors,
      counts,
      "presence_updated_count",
      "polled_count",
    );
    addGreaterThanError(
      errors,
      counts,
      "activity_inserted_count",
      "presence_updated_count",
    );
    addSummaryTotalMismatchError(
      errors,
      readSummaryTotal(row.provider_result_summary),
      counts.polled_count,
      "provider_result_summary.total",
      "polled_count",
    );
    addSummaryTotalMismatchError(
      errors,
      readSummaryTotal(row.skipped_summary),
      counts.skipped_count,
      "skipped_summary.total",
      "skipped_count",
    );
    return;
  }

  if (check.id === "account-deletion") {
    addGreaterThanError(errors, counts, "due_request_count", "limit_count");
    addSumMismatchError(
      errors,
      counts,
      ["completed_count", "failed_count"],
      "claimed_count",
    );
    addSumMismatchError(
      errors,
      counts,
      ["claimed_count", "skipped_count"],
      "due_request_count",
    );
    if (counts.would_process_count > 0) {
      errors.push("would_process_count is greater than 0 for a live row.");
    }
    addSummaryTotalMismatchError(
      errors,
      readSummaryTotal(row.skipped_summary),
      counts.skipped_count,
      "skipped_summary",
      "skipped_count",
    );
    if (
      counts.storage_bucket_count !== undefined &&
      counts.storage_bucket_count !== expectedAccountDeletionStorageBucketCount
    ) {
      errors.push("storage_bucket_count does not match configured buckets.");
    }
  }
}

function safeRunId(value) {
  const runId = clean(value);
  if (!runId) return "";
  if (!safeRunIdPattern.test(runId)) return "";
  if (secretLikeEvidenceValuePattern.test(runId)) return "";
  if (uuidRunIdPattern.test(runId)) return runId;
  if (specificRunIdTokenPattern.test(runId) && /\d/.test(runId)) return runId;
  if (/scheduled/i.test(runId) && hostedCronLaneRunIdPattern.test(runId)) {
    return runId;
  }
  return "";
}

export function summarizeRun(
  check,
  row,
  now = new Date(),
  freshness = freshnessMs(process.env, check),
) {
  const completedAt = new Date(row.completed_at);
  const ageMs = now.getTime() - completedAt.getTime();
  const errors = [];
  const runId = safeRunId(row.run_id);

  if (!clean(row.run_id)) {
    errors.push("run_id missing.");
  } else if (!runId) {
    errors.push("run_id is not a safe evidence identifier.");
  }
  if (row.trigger_source !== "scheduled")
    errors.push("trigger_source is not scheduled.");
  if (row.dry_run !== false) errors.push("dry_run is not false.");
  if (row.status !== "completed") errors.push("status is not completed.");
  if (!Number.isFinite(completedAt.getTime()))
    errors.push("completed_at is invalid.");
  if (Number.isFinite(completedAt.getTime()) && ageMs > freshness) {
    errors.push("completed_at is older than the configured freshness window.");
  }
  if (Number.isFinite(completedAt.getTime()) && ageMs < 0) {
    errors.push("completed_at is in the future.");
  }
  if ("failed_count" in row) {
    const failedCount = evidenceCount(row.failed_count);
    if (failedCount === null) {
      errors.push("failed_count is invalid.");
    } else if (failedCount > 0) {
      errors.push("failed_count is greater than 0.");
    }
  }
  for (const key of check.select.filter(isCountKey)) {
    if (!(key in row)) {
      errors.push(`${key} missing.`);
      continue;
    }
    if (key === "failed_count") continue;
    const value = row[key];
    if (evidenceCount(value) === null) {
      errors.push(`${key} is invalid.`);
    }
  }
  const counts = pickCounts(row);
  addCountRelationshipErrors(check, row, counts, errors);

  return {
    ageMinutes: Number.isFinite(ageMs) ? Math.round(ageMs / 60000) : null,
    completedAt: row.completed_at ?? null,
    counts,
    id: check.id,
    ready: errors.length === 0,
    runId: runId || (clean(row.run_id) ? "[redacted-invalid-run-id]" : null),
    table: check.table,
    validationErrors: errors,
  };
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

export async function fetchLatestScheduledRun(
  check,
  env = process.env,
  fetchImpl = fetch,
) {
  const auth = restAuth(env);
  const missing = missingRequiredEnv(env);
  if (!auth || missing.length > 0) {
    throw new Error(`Missing hosted cron evidence env: ${missing.join(", ")}`);
  }
  const response = await fetchImpl(buildLatestScheduledRunUrl(check, env), {
    headers: {
      apikey: auth.apiKey,
      Authorization: `Bearer ${auth.bearer}`,
      Accept: "application/json",
    },
    method: "GET",
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(
      `${check.id} evidence read failed with HTTP ${response.status}.`,
    );
  }
  if (!Array.isArray(payload)) {
    throw new Error(`${check.id} evidence read did not return an array.`);
  }
  return payload[0] ?? null;
}

function summarizeEvidenceReadFailure(check, error) {
  const message = error instanceof Error ? error.message : "";
  const httpMatch = message.match(
    new RegExp(`^${check.id} evidence read failed with HTTP (\\d+)\\.$`),
  );
  if (httpMatch) {
    return `Evidence REST read failed with HTTP ${httpMatch[1]}.`;
  }
  if (message === `${check.id} evidence read did not return an array.`) {
    return "Evidence REST read did not return an array.";
  }
  return "Evidence REST read failed.";
}

export async function collectCronEvidence(
  env = process.env,
  fetchImpl = fetch,
  now = new Date(),
  checks = selectedCronEvidenceChecks(env),
) {
  const missing = missingRequiredEnv(env);
  if (missing.length > 0) {
    throw new Error(`Missing hosted cron evidence env: ${missing.join(", ")}`);
  }

  const results = [];
  for (const check of checks) {
    let row;
    try {
      row = await fetchLatestScheduledRun(check, env, fetchImpl);
    } catch (error) {
      results.push({
        id: check.id,
        ready: false,
        table: check.table,
        validationErrors: [summarizeEvidenceReadFailure(check, error)],
      });
      continue;
    }
    if (!row) {
      results.push({
        id: check.id,
        ready: false,
        table: check.table,
        validationErrors: ["No scheduled evidence row found."],
      });
      continue;
    }
    results.push(summarizeRun(check, row, now, freshnessMs(env, check)));
  }
  return results;
}

export function artifactHintsFromResults(results, checks = cronEvidenceChecks) {
  if (results.some((result) => !result.ready)) {
    throw new Error(
      "Hosted cron evidence is incomplete; artifact hints require every selected scheduled non-dry-run row to validate.",
    );
  }

  const resultById = new Map(results.map((result) => [result.id, result]));
  const lines = [
    "Hosted cron artifact handoff hints",
    "",
    "Use these lines as Artifact Evidence Details after operator review. This output does not complete proof checklist rows.",
  ];
  const flatPriceDropStoreArtifact =
    checks.length === 1 && checks[0]?.id === "price-drop";

  for (const check of checks) {
    const result = resultById.get(check.id);
    const runId = safeRunId(result?.runId);
    if (!result || !runId) {
      throw new Error(
        "Hosted cron evidence is incomplete; artifact hints require every selected scheduled non-dry-run row to validate.",
      );
    }

    if (flatPriceDropStoreArtifact) {
      lines.push(
        "",
        `- Hosted cron table: ${check.table}`,
        `- Function: ${check.functionName}`,
        `- Run ID: ${runId}`,
        "- Scheduled: scheduled",
        "- dry_run=false: confirmed false",
        "- Status: completed",
      );
      continue;
    }

    lines.push(
      "",
      `### ${check.id}`,
      `- Hosted cron table: ${check.table}`,
      `- Function: ${check.functionName}`,
      `- Run ID: ${runId}`,
      "- Scheduled: scheduled",
      "- dry_run=false: confirmed false",
      "- Status: completed",
    );
  }

  return lines.join("\n");
}

function redactPacketValue(value) {
  const text = clean(value);
  if (!text) return "";
  if (secretLikeEvidenceValuePattern.test(text)) return "[redacted]";
  return text.replace(/\bhttps:\/\/[^\s)]+/gi, "[redacted-url]");
}

function countsSummary(counts) {
  const entries = Object.entries(counts ?? {});
  if (entries.length === 0) return "none";
  return entries
    .map(([key, value]) => `${key}=${value}`)
    .slice(0, 10)
    .join("; ");
}

function selectedCheckIds(checks) {
  return checks.map((check) => check.id);
}

function externalEvidenceGateForChecks(checks) {
  const ids = selectedCheckIds(checks);
  if (ids.length === 1 && ids[0] === "price-drop") return "store-stripe-live";
  const expected = new Set(cronEvidenceChecks.map((check) => check.id));
  const selected = new Set(ids);
  if (
    ids.length === expected.size &&
    selected.size === expected.size &&
    [...expected].every((id) => selected.has(id))
  ) {
    return "hosted-supabase-cron";
  }
  return "";
}

function externalEvidencePreflightHandoff(checks) {
  const gateId = externalEvidenceGateForChecks(checks);
  if (!gateId) {
    return "No single external completion gate maps to this selected cron subset; collect the full gate packet before checking proof rows.";
  }
  return `Use the matching \`OGL_EXTERNAL_EVIDENCE_GATES=${gateId} pnpm external:evidence:preflight\` command.`;
}

function artifactPasteTargetLines(checks) {
  const ids = checks.map((check) => check.id);
  if (ids.length === 1 && ids[0] === "price-drop") {
    return [
      "- price-drop: paste `pnpm hosted:cron-evidence:artifact-hints --checks=price-drop` output into `docs/verification/external/store-price-drop-scheduler-live.md` under `Gate-Specific Evidence`.",
    ];
  }

  if (externalEvidenceGateForChecks(checks) === "hosted-supabase-cron") {
    return checks.map(
      (check) =>
        `- ${check.id}: paste this lane's artifact hints into \`docs/verification/external/hosted-supabase-cron.md\` under \`### ${check.id}\`.`,
    );
  }

  return [
    "- No single artifact target maps to this selected cron subset; collect `price-drop` only for `docs/verification/external/store-price-drop-scheduler-live.md` or all scheduler lanes for `docs/verification/external/hosted-supabase-cron.md`.",
  ];
}

export function hostedCronEvidencePacket(
  results = [],
  env = process.env,
  now = new Date(),
  checks = selectedCronEvidenceChecks(env),
) {
  const missingEnv = missingRequiredEnv(env);
  const resultById = new Map(results.map((result) => [result.id, result]));
  const readyCount = checks.filter(
    (check) => resultById.get(check.id)?.ready,
  ).length;
  const allReady = missingEnv.length === 0 && readyCount === checks.length;
  const lines = [
    "Hosted cron evidence operator packet",
    "",
    `Generated at: ${now.toISOString()}`,
    `REST base URL: ${deriveRestBaseUrl(env) ? "configured" : missingRestBaseUrlLabel}`,
    `Freshness windows: ${planSummary(env, checks).freshnessHours}`,
    `Selected checks: ${checks.map((check) => check.id).join("; ")}`,
    `Ready rows: ${readyCount}/${checks.length}`,
    `Hosted cron evidence: ${
      allReady
        ? "rows validate; scheduler dashboard/config proof still required"
        : "not proven; scheduled non-dry-run rows still need validation"
    }`,
    "",
    "This packet is redacted and non-mutating. It does not call Edge Functions, create schedules, write rows, print REST/auth values, mark proof rows checked, or prove external scheduler ownership.",
    "",
  ];

  if (missingEnv.length > 0) {
    lines.push(`Missing env names: ${missingEnv.join("; ")}`, "");
  }

  lines.push("## Row Validation", "");
  for (const check of checks) {
    const result = resultById.get(check.id);
    const resultErrors =
      result?.validationErrors?.map(redactPacketValue).filter(Boolean) ?? [];
    const errors =
      missingEnv.length > 0
        ? [
            ...resultErrors,
            "Collection blocked: missing hosted cron evidence env.",
          ]
        : resultErrors;
    lines.push(`### ${check.id}`);
    lines.push(`- Table: ${check.table}`);
    lines.push(`- Function: ${check.functionName}`);
    lines.push(`- State: ${result?.ready ? "ready" : "missing evidence"}`);
    lines.push(
      `- Run ID: ${redactPacketValue(result?.runId) || "not collected"}`,
    );
    lines.push(
      `- Completed at: ${redactPacketValue(result?.completedAt) || "not collected"}`,
    );
    lines.push(
      `- Age minutes: ${result?.ageMinutes === null || result?.ageMinutes === undefined ? "not collected" : result.ageMinutes}`,
    );
    lines.push(`- Counts: ${countsSummary(result?.counts)}`);
    lines.push(
      `- Validation errors: ${errors.length === 0 ? "none" : errors.join("; ")}`,
    );
    lines.push("");
  }

  lines.push("## External Artifact Paste Targets", "");
  lines.push(...artifactPasteTargetLines(checks));
  lines.push("");

  lines.push("## Artifact Detail Hints", "");
  if (allReady) {
    lines.push(artifactHintsFromResults(results, checks));
  } else {
    lines.push(
      "Artifact hints unavailable until every selected scheduled non-dry-run row validates.",
    );
  }
  lines.push(
    "",
    `Scheduler dashboard/config proof is still required before checking external proof rows. Pair this packet with \`pnpm hosted:deploy-gate:scheduler-packet\`, scheduler dashboard evidence, and this handoff: ${externalEvidencePreflightHandoff(checks)}`,
  );

  return lines.join("\n").trimEnd();
}

export function planSummary(
  env = process.env,
  checks = selectedCronEvidenceChecks(env),
) {
  const freshness = clean(env.OGL_HOSTED_CRON_FRESHNESS_HOURS);
  const freshnessValue = freshness ? Number(freshness) : 1;
  const freshnessIsValid =
    Number.isFinite(freshnessValue) && freshnessValue > 0;
  return {
    freshnessHours: freshnessIsValid
      ? checks
          .map((check) => `${check.id}=${freshnessHoursForCheck(check, env)}h`)
          .join("; ")
      : "(invalid)",
    restBaseUrl: deriveRestBaseUrl(env)
      ? "configured"
      : missingRestBaseUrlLabel,
    selectedChecks: checks.map((check) => check.id),
  };
}

function printPlan(
  env = process.env,
  checks = selectedCronEvidenceChecks(env),
) {
  const summary = planSummary(env, checks);
  console.log("Hosted cron evidence plan");
  console.log("");
  console.log(`REST base URL: ${summary.restBaseUrl}`);
  console.log(`Freshness windows: ${summary.freshnessHours}`);
  console.log(`Selected checks: ${summary.selectedChecks.join("; ")}`);
  console.log("");
  for (const check of checks) {
    console.log(`- ${check.id}: ${check.table}`);
  }
}

async function main() {
  const { action, checks: requestedChecks } = parseArgs(process.argv.slice(2));
  const checks = selectedCronEvidenceChecks(process.env, requestedChecks);
  if (action !== "artifact-hints") {
    printPlan(process.env, checks);
  }
  if (action === "plan") return;
  if (action === "packet" && missingRequiredEnv().length > 0) {
    console.log("");
    console.log(hostedCronEvidencePacket([], process.env, new Date(), checks));
    return;
  }

  const results = await collectCronEvidence(
    process.env,
    fetch,
    new Date(),
    checks,
  );
  if (action === "packet") {
    console.log("");
    console.log(
      hostedCronEvidencePacket(results, process.env, new Date(), checks),
    );
    return;
  }
  if (action === "artifact-hints") {
    console.log(artifactHintsFromResults(results, checks));
    return;
  }

  console.log("");
  console.log(JSON.stringify({ results }, null, 2));
  if (results.some((result) => !result.ready)) {
    throw new Error("Hosted cron evidence is incomplete.");
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
