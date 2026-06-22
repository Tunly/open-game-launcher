import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
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
  assert.deepEqual(
    calls.map((call) => call.args.slice(4)),
    [
      ["status", "--workdir", "..", "--output", "json"],
      ["db", "lint", "--workdir", "..", "--local", "--fail-on", "error"],
    ],
  );
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
  assert.deepEqual(
    calls.map((call) => call.args.slice(4)),
    [
      ["status", "--workdir", "..", "--output", "json"],
      ["start", "--workdir", "..", "--no-api"],
      ["db", "lint", "--workdir", "..", "--local", "--fail-on", "error"],
      ["stop", "--workdir", ".."],
    ],
  );
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
  assert.deepEqual(calls.at(-1).args.slice(4), ["stop", "--workdir", ".."]);
});
