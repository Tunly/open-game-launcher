#!/usr/bin/env node
// Open Game Launcher — Cloud storage setup script
//
// Ensures the private `game-saves` Supabase Storage bucket exists and the
// per-user RLS policies are applied. Idempotent — safe to run multiple times.
//
// Required env (read from .env.local at repo root if present):
//   SUPABASE_URL                    — e.g. https://abc.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY       — service role JWT (NEVER expose to the web)
//
// Usage:
//   pnpm setup:cloud
//   node launcher/scripts/setup-cloud.mjs
//   node launcher/scripts/setup-cloud.mjs --dry-run

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const dryRun = process.argv.includes("--dry-run");

function loadEnvLocal() {
  const envPath = resolve(repoRoot, ".env.local");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "") ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function logStep(label) {
  process.stdout.write(`\n\u001b[36m\u25a0\u001b[0m ${label}\n`);
}

function logOk(msg) {
  process.stdout.write(`  \u001b[32m\u2713\u001b[0m ${msg}\n`);
}

function logWarn(msg) {
  process.stdout.write(`  \u001b[33m!\u001b[0m ${msg}\n`);
}

function logErr(msg) {
  process.stdout.write(`  \u001b[31m\u2717\u001b[0m ${msg}\n`);
}

function fail(msg) {
  logErr(msg);
  process.exit(1);
}

if (!SUPABASE_URL) {
  fail(
    "SUPABASE_URL is missing. Set it in .env.local at the repo root or in your shell.",
  );
}
if (!SERVICE_KEY) {
  fail(
    "SUPABASE_SERVICE_ROLE_KEY is missing. Set it in .env.local at the repo root or in your shell.",
  );
}

const baseHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function supabaseRequest(path, init = {}) {
  const url = `${SUPABASE_URL}${path}`;
  const response = await fetch(url, { ...init, headers: { ...baseHeaders, ...(init.headers ?? {}) } });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? payload.message
        : typeof payload === "string"
          ? payload
          : `HTTP ${response.status}`;
    throw new Error(`${response.status} ${response.statusText}: ${message}`);
  }
  return payload;
}

async function ensureBucket() {
  logStep("Ensure private bucket: game-saves");
  if (dryRun) {
    logOk("[dry-run] would create or update game-saves bucket");
    return;
  }
  const existing = await supabaseRequest("/storage/v1/bucket/game-saves", {
    method: "GET",
  });
  if (existing && existing.id) {
    if (existing.public === true) {
      logWarn("Bucket exists but is public — flipping to private.");
      await supabaseRequest("/storage/v1/bucket/game-saves", {
        method: "PUT",
        body: JSON.stringify({ public: false }),
      });
      logOk("Bucket updated to private.");
    } else {
      logOk("Bucket already exists and is private.");
    }
    return;
  }
  await supabaseRequest("/storage/v1/bucket", {
    method: "POST",
    body: JSON.stringify({
      id: "game-saves",
      name: "game-saves",
      public: false,
      fileSizeLimit: 52428800,
      allowedMimeTypes: [
        "application/octet-stream",
        "application/json",
        "text/plain",
      ],
    }),
  });
  logOk("Bucket created.");
}

const REQUIRED_POLICIES = [
  {
    name: "library_cloud_sync_storage_read_own_saves",
    definition: {
      sql: "bucket_id = 'game-saves' and (storage.foldername(name))[1] = auth.uid()::text",
    },
    operations: ["SELECT"],
  },
  {
    name: "library_cloud_sync_storage_insert_own_saves",
    definition: {
      sql: "bucket_id = 'game-saves' and (storage.foldername(name))[1] = auth.uid()::text",
    },
    operations: ["INSERT"],
  },
  {
    name: "library_cloud_sync_storage_update_own_saves",
    definition: {
      sql: "bucket_id = 'game-saves' and (storage.foldername(name))[1] = auth.uid()::text",
    },
    operations: ["UPDATE"],
  },
  {
    name: "library_cloud_sync_storage_delete_own_saves",
    definition: {
      sql: "bucket_id = 'game-saves' and (storage.foldername(name))[1] = auth.uid()::text",
    },
    operations: ["DELETE"],
  },
];

async function ensurePolicies() {
  logStep("Ensure storage RLS policies");
  for (const policy of REQUIRED_POLICIES) {
    if (dryRun) {
      logOk(`[dry-run] would upsert policy: ${policy.name}`);
      continue;
    }
    try {
      await supabaseRequest(
        `/storage/v1/bucket/game-saves/policy/${encodeURIComponent(policy.name)}`,
        { method: "GET" },
      );
      logOk(`Policy exists: ${policy.name}`);
      continue;
    } catch (error) {
      // 404 = missing → create
      const message = error instanceof Error ? error.message : String(error);
      if (!message.startsWith("404")) throw error;
    }
    await supabaseRequest("/storage/v1/bucket/game-saves/policy", {
      method: "POST",
      body: JSON.stringify({
        name: policy.name,
        definition: policy.definition,
        allowed_operations: policy.operations,
      }),
    });
    logOk(`Policy created: ${policy.name}`);
  }
}

async function verifyTables() {
  logStep("Verify cloud metadata tables exist");
  if (dryRun) {
    logOk("[dry-run] would probe user_cloud_save_sets, user_cloud_save_files, user_library_snapshots");
    return;
  }
  const tables = [
    "user_cloud_save_sets",
    "user_cloud_save_files",
    "user_library_snapshots",
  ];
  for (const table of tables) {
    try {
      await supabaseRequest(
        `/rest/v1/${table}?select=id&limit=1`,
        { method: "GET" },
      );
      logOk(`Table present: ${table}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("404")) {
        logWarn(
          `Table missing: ${table}. Run \`pnpm supabase:db:push\` to apply migrations.`,
        );
      } else {
        throw error;
      }
    }
  }
}

async function main() {
  process.stdout.write("\u001b[1mOpen Game Launcher — Cloud setup\u001b[0m\n");
  process.stdout.write(`Target: ${SUPABASE_URL}\n`);
  if (dryRun) {
    process.stdout.write("Mode: \u001b[33mdry-run\u001b[0m (no changes will be made)\n");
  }
  try {
    await ensureBucket();
    await ensurePolicies();
    await verifyTables();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(message);
  }
  logStep("Done");
  process.stdout.write(
    "  Cloud storage is ready. Restart the launcher to pick up the new bucket.\n\n",
  );
}

await main();
