#!/usr/bin/env node
import { pathToFileURL } from "node:url";

export const requiredSteamRelayE2EEnv = Object.freeze([
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_AUTH_JWT",
  "OGL_STEAM_RELAY_GAME_ID",
  "OGL_STEAM_RELAY_STEAM_APP_ID",
]);

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const jwtPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hostedSupabaseBaseUrl(value) {
  const raw = clean(value).replace(/\/+$/, "");
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.port || url.username || url.password) {
      return "";
    }
    if (
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    ) {
      return "";
    }
    if (!/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname)) return "";
    return url.origin;
  } catch {
    return "";
  }
}

function safeApiKey(value) {
  const key = clean(value);
  if (/^sb_publishable_[A-Za-z0-9._~-]{20,}$/.test(key)) return key;
  return jwtPattern.test(key) ? key : "";
}

export function validateSteamRelayE2EEnv(env = process.env) {
  const errors = [];
  const baseUrl = hostedSupabaseBaseUrl(env.SUPABASE_URL);
  const apiKey = safeApiKey(env.SUPABASE_ANON_KEY);
  const authJwt = clean(env.SUPABASE_AUTH_JWT);
  const gameId = clean(env.OGL_STEAM_RELAY_GAME_ID);
  const steamAppId = clean(env.OGL_STEAM_RELAY_STEAM_APP_ID);

  if (!baseUrl) errors.push("SUPABASE_URL");
  if (!apiKey) errors.push("SUPABASE_ANON_KEY");
  if (!jwtPattern.test(authJwt) || authJwt === apiKey) {
    errors.push("SUPABASE_AUTH_JWT");
  }
  if (!uuidPattern.test(gameId)) errors.push("OGL_STEAM_RELAY_GAME_ID");
  if (!/^\d{1,10}$/.test(steamAppId) || steamAppId === "0") {
    errors.push("OGL_STEAM_RELAY_STEAM_APP_ID");
  }

  return {
    errors,
    values:
      errors.length === 0
        ? { apiKey, authJwt, baseUrl, gameId, steamAppId }
        : null,
  };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function runSteamRelayE2E(
  env = process.env,
  fetchImpl = fetch,
  log = console.log,
) {
  const validation = validateSteamRelayE2EEnv(env);
  if (validation.errors.length > 0 || !validation.values) {
    throw new Error(
      `Missing or invalid Steam relay E2E env: ${validation.errors.join(", ")}`,
    );
  }
  const values = validation.values;
  let response;
  try {
    response = await fetchImpl(
      `${values.baseUrl}/functions/v1/relay-steam-achievements`,
      {
        body: JSON.stringify({
          gameId: values.gameId,
          steamAppId: values.steamAppId,
        }),
        headers: {
          apikey: values.apiKey,
          Authorization: `Bearer ${values.authJwt}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch {
    throw new Error(
      "relay-steam-achievements transport failed (detail redacted)",
    );
  }
  const payload = await readJson(response);
  if (
    response.status !== 503 ||
    !payload ||
    payload.code !== "steam_login_session_required" ||
    payload.persistence !== "local_only" ||
    payload.trust !== "client_session"
  ) {
    throw new Error(
      `relay-steam-achievements expected fail-closed HTTP 503 but received HTTP ${response.status} (response body redacted)`,
    );
  }

  log(
    "ok relay-steam-achievements status=503 code=steam_login_session_required persistence=local_only trust=client_session writes=0",
  );
  return {
    code: payload.code,
    persistence: payload.persistence,
    status: response.status,
    trust: payload.trust,
    writes: 0,
  };
}

export function steamRelayE2EPlan() {
  return [
    "Hosted Steam achievement-relay fail-closed E2E plan",
    "",
    "NON-MUTATING CHECK: hosted relay has no Steam provider key or attestation authority and must not persist achievements or XP.",
    "Required environment names:",
    ...requiredSteamRelayE2EEnv.map((name) => `- ${name}`),
    "",
    "Request:",
    '- relay-steam-achievements {"gameId":"[redacted-catalog-uuid]","steamAppId":"[redacted]"}',
    "Expected: HTTP 503, code=steam_login_session_required, persistence=local_only, trust=client_session.",
    "Native Steam login-session data remains local to the launcher.",
    "",
    "The runner never prints JWTs, API keys, Steam IDs/AppIDs, raw response bodies, or catalog game IDs.",
  ].join("\n");
}

function parseAction(argv) {
  if (argv.length > 1 || (argv[0] && !["plan", "run"].includes(argv[0]))) {
    throw new Error("Use `plan` or `run`.");
  }
  return argv[0] ?? "plan";
}

async function main() {
  const action = parseAction(process.argv.slice(2));
  if (action === "plan") {
    console.log(steamRelayE2EPlan());
    return;
  }
  await runSteamRelayE2E();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Steam relay E2E failed.",
    );
    process.exit(1);
  });
}
