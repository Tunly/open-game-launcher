import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  pnpmExecutable,
  pnpmInvocation,
  redactSupabaseOutput,
  runSupabaseDbLint,
  supabaseArgs,
} from "./supabase-db-lint.mjs";

const supabaseConfig = readFileSync(
  new URL("../supabase/config.toml", import.meta.url),
  "utf8",
);

function fakeRunner(results, calls) {
  return (command, args) => {
    calls.push({ args, command });
    const result = results.shift() ?? { status: 0, stdout: "", stderr: "" };
    return { stderr: "", stdout: "", ...result };
  };
}

function supabaseSubcommand(call) {
  const supabaseIndex = call.args.lastIndexOf("supabase");
  return call.args.slice(supabaseIndex + 1);
}

test("supabaseArgs uses the launcher-pinned Supabase CLI", () => {
  assert.deepEqual(supabaseArgs(["db", "lint"]), [
    "--dir",
    "launcher",
    "exec",
    "supabase",
    "db",
    "lint",
  ]);
});

test("pnpmExecutable resolves the Windows command shim", () => {
  assert.equal(pnpmExecutable("win32"), "pnpm.cmd");
  assert.equal(pnpmExecutable("linux"), "pnpm");
});

test("pnpmInvocation runs the Windows shim through cmd without shell mode", () => {
  assert.deepEqual(
    pnpmInvocation(["--version"], { platform: "win32", comspec: "cmd.exe" }),
    {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "pnpm.cmd", "--version"],
    },
  );
});

test("supabase config explicitly matches hosted Data API exposure defaults", () => {
  assert.match(supabaseConfig, /^auto_expose_new_tables = false$/m);
  assert.doesNotMatch(supabaseConfig, /Leave unset today|2026-05-30/);
});

test("redactSupabaseOutput removes local Supabase credentials and database URLs", () => {
  const output = redactSupabaseOutput(
    [
      "DB URL: postgresql://postgres:secret@127.0.0.1:54322/postgres",
      "anon key: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbm9uIn0.signature",
      "service_role key: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZXJ2aWNlIn0.signature",
      "SUPABASE_ACCESS_TOKEN=sbp_should_not_print",
    ].join("\n"),
  );

  assert.doesNotMatch(output, /secret|eyJ|sbp_should_not_print/);
  assert.match(output, /DB URL: \[redacted\]/);
  assert.match(output, /anon key: \[redacted\]/);
  assert.match(output, /service_role key: \[redacted\]/);
  assert.match(output, /\[redacted-supabase-token\]/);
});

test("runSupabaseDbLint reuses an already running local database", () => {
  const calls = [];
  const exitCode = runSupabaseDbLint({
    runCommand: fakeRunner(
      [
        { status: 0, stdout: "{}" },
        { status: 0, stdout: "No schema errors found\n" },
      ],
      calls,
    ),
    stderr: { write() {} },
    stdout: { write() {} },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.map(supabaseSubcommand), [
    ["status", "--workdir", "..", "--output", "json"],
    ["db", "lint", "--workdir", "..", "--local", "--fail-on", "error"],
  ]);
});

test("runSupabaseDbLint starts and stops the local database when needed", () => {
  const calls = [];
  const exitCode = runSupabaseDbLint({
    runCommand: fakeRunner(
      [
        { status: 1, stderr: "not running" },
        { status: 0, stdout: "started\n" },
        { status: 0, stdout: "No schema errors found\n" },
        { status: 0, stdout: "stopped\n" },
      ],
      calls,
    ),
    stderr: { write() {} },
    stdout: { write() {} },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls.map(supabaseSubcommand), [
    ["status", "--workdir", "..", "--output", "json"],
    [
      "start",
      "--workdir",
      "..",
      "--exclude",
      "edge-runtime,gotrue,imgproxy,kong,logflare,mailpit,postgres-meta,postgrest,realtime,storage-api,studio,supavisor,vector",
    ],
    ["db", "lint", "--workdir", "..", "--local", "--fail-on", "error"],
    ["stop", "--workdir", ".."],
  ]);
});

test("runSupabaseDbLint still stops a self-started database after lint failure", () => {
  const calls = [];
  const exitCode = runSupabaseDbLint({
    runCommand: fakeRunner(
      [
        { status: 1, stderr: "not running" },
        { status: 0, stdout: "started\n" },
        { status: 2, stderr: "schema error\n" },
        { status: 0, stdout: "stopped\n" },
      ],
      calls,
    ),
    stderr: { write() {} },
    stdout: { write() {} },
  });

  assert.equal(exitCode, 2);
  assert.deepEqual(supabaseSubcommand(calls.at(-1)), [
    "stop",
    "--workdir",
    "..",
  ]);
});

test("runSupabaseDbLint fails when the command cannot be spawned", () => {
  const exitCode = runSupabaseDbLint({
    runCommand: () => ({
      error: Object.assign(new Error("spawn pnpm ENOENT"), { code: "ENOENT" }),
      status: null,
      stderr: "",
      stdout: "",
    }),
    stderr: { write() {} },
    stdout: { write() {} },
  });

  assert.equal(exitCode, 1);
});
