import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  requiredSteamRelayE2EEnv,
  runSteamRelayE2E,
  steamRelayE2EPlan,
  validateSteamRelayE2EEnv,
} from "./hosted-steam-achievement-e2e.mjs";

const authJwt = `${"a".repeat(40)}.${"b".repeat(40)}.${"c".repeat(40)}`;
const apiKey = `sb_publishable_${"d".repeat(32)}`;
const gameId = "123e4567-e89b-42d3-a456-426614174000";
const steamAppId = "730";

function validEnv(overrides = {}) {
  return {
    OGL_STEAM_RELAY_GAME_ID: gameId,
    OGL_STEAM_RELAY_STEAM_APP_ID: steamAppId,
    SUPABASE_ANON_KEY: apiKey,
    SUPABASE_AUTH_JWT: authJwt,
    SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co",
    ...overrides,
  };
}

test("Steam relay E2E plan documents only the redacted fail-closed probe", () => {
  const plan = steamRelayE2EPlan();
  for (const name of requiredSteamRelayE2EEnv) {
    assert.match(plan, new RegExp(name));
  }
  assert.match(plan, /NON-MUTATING CHECK/);
  assert.match(plan, /steam_login_session_required/);
  assert.match(plan, /persistence=local_only/);
  assert.match(plan, /trust=client_session/);
  assert.doesNotMatch(plan, /link-steam-account/);
  assert.doesNotMatch(plan, /STEAM_WEB_API_KEY/);
  assert.doesNotMatch(plan, /ACHIEVEMENT_INGESTION_ATTESTATION_SECRET/);
});

test("Steam relay E2E validates hosted target, caller auth, game, and AppID", () => {
  assert.deepEqual(validateSteamRelayE2EEnv(validEnv()).errors, []);
  const invalid = validateSteamRelayE2EEnv(
    validEnv({
      OGL_STEAM_RELAY_GAME_ID: "steam-app-id-730",
      OGL_STEAM_RELAY_STEAM_APP_ID: "not-an-app-id",
      SUPABASE_AUTH_JWT: apiKey,
      SUPABASE_URL: "https://attacker.example",
    }),
  );
  assert.deepEqual(invalid.errors, [
    "SUPABASE_URL",
    "SUPABASE_AUTH_JWT",
    "OGL_STEAM_RELAY_GAME_ID",
    "OGL_STEAM_RELAY_STEAM_APP_ID",
  ]);
  assert.equal(invalid.values, null);
});

test("Steam relay E2E accepts only the session-required local-only contract", async () => {
  const calls = [];
  const logs = [];
  const result = await runSteamRelayE2E(
    validEnv(),
    async (url, init) => {
      calls.push({
        body: JSON.parse(init.body),
        headers: init.headers,
        method: init.method,
        url,
      });
      return Response.json(
        {
          code: "steam_login_session_required",
          error: "Native Steam login session required.",
          persistence: "local_only",
          trust: "client_session",
        },
        { status: 503 },
      );
    },
    (line) => logs.push(line),
  );

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { gameId, steamAppId });
  assert.equal(calls[0].method, "POST");
  assert.equal(
    calls[0].url,
    "https://awebfvfyqzwapcgixdfj.supabase.co/functions/v1/relay-steam-achievements",
  );
  assert.equal(calls[0].headers.apikey, apiKey);
  assert.equal(calls[0].headers.Authorization, `Bearer ${authJwt}`);
  assert.deepEqual(result, {
    code: "steam_login_session_required",
    persistence: "local_only",
    status: 503,
    trust: "client_session",
    writes: 0,
  });

  const output = logs.join("\n");
  assert.match(output, /status=503/);
  assert.match(output, /writes=0/);
  for (const secret of [apiKey, authJwt, gameId, steamAppId]) {
    assert.equal(output.includes(secret), false);
  }
});

test("Steam relay E2E rejects hosted success and redacts response bodies", async () => {
  const rawError = "provider response raw-secret-must-not-print";
  await assert.rejects(
    () =>
      runSteamRelayE2E(validEnv(), async () =>
        Response.json(
          {
            achievementsSynced: 2,
            error: rawError,
            ok: true,
            persistence: "hosted",
            trust: "provider_verified",
          },
          { status: 200 },
        ),
      ),
    (error) => {
      assert.match(error.message, /expected fail-closed HTTP 503/);
      assert.match(error.message, /response body redacted/);
      assert.equal(error.message.includes(rawError), false);
      assert.equal(error.message.includes(gameId), false);
      return true;
    },
  );
});

test("Steam relay fail-closed wiring is documented and covered by CI", () => {
  const rootPackage = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  const envExample = readFileSync(
    new URL("../supabase/functions/.env.example", import.meta.url),
    "utf8",
  );
  const runbook = readFileSync(
    new URL("../docs/runbooks/steam-achievement-relay-e2e.md", import.meta.url),
    "utf8",
  );
  const workflow = readFileSync(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  const relayHandler = readFileSync(
    new URL(
      "../supabase/functions/relay-steam-achievements/handler.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const relayAdapters = readFileSync(
    new URL(
      "../supabase/functions/relay-steam-achievements/adapters.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.equal(
    rootPackage.scripts["hosted:steam-relay:e2e:plan"],
    "node scripts/hosted-steam-achievement-e2e.mjs plan",
  );
  assert.equal(
    rootPackage.scripts["hosted:steam-relay:e2e:run"],
    "node scripts/hosted-steam-achievement-e2e.mjs run",
  );
  assert.match(
    workflow,
    /node --test scripts\/hosted-steam-achievement-e2e\.test\.mjs/,
  );
  assert.match(runbook, /steam_login_session_required/);
  assert.match(runbook, /trust=client_session/);
  assert.match(relayHandler, /steam_login_session_required/);
  assert.match(relayHandler, /persistence: "local_only"/);
  assert.match(relayHandler, /trust: "client_session"/);
  assert.doesNotMatch(relayAdapters, /STEAM_WEB_API_KEY/);
  assert.doesNotMatch(
    relayAdapters,
    /ACHIEVEMENT_INGESTION_ATTESTATION_SECRET/,
  );

  const relaySection =
    envExample.match(
      /# --- ingest-achievements[\s\S]*?(?=\n# --- notify-price-drop)/,
    )?.[0] ?? "";
  assert.doesNotMatch(relaySection, /STEAM_WEB_API_KEY=/);
  assert.doesNotMatch(runbook, /^- `STEAM_WEB_API_KEY`$/m);
  assert.doesNotMatch(
    runbook,
    /^- `ACHIEVEMENT_INGESTION_ATTESTATION_SECRET`/m,
  );
});
