import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildDenoCheckArgs,
  buildDenoArgs,
  collectCheckFiles,
  collectTestFiles,
  denoNpmSpecifier,
  denoVersion,
  functionsRootFor,
  runSupabaseFunctionsCheck,
  runSupabaseFunctionsTests,
} from "./supabase-functions-test.mjs";

const functionsEnvExample = readFileSync(
  new URL("../supabase/functions/.env.example", import.meta.url),
  "utf8",
);
const launcherEnvExample = readFileSync(
  new URL("../launcher/.env.example", import.meta.url),
  "utf8",
);
const ciWorkflow = readFileSync(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

function tempRepo() {
  const root = mkdtempSync(join(tmpdir(), "ogl-supabase-functions-test-"));
  return {
    root,
    cleanup: () => rmSync(root, { force: true, recursive: true }),
  };
}

function silentLogger() {
  return {
    error() {},
    log() {},
  };
}

test("collectTestFiles returns repo-relative sorted Deno test paths", () => {
  const { root, cleanup } = tempRepo();
  try {
    mkdirSync(join(root, "supabase", "functions", "alpha"), {
      recursive: true,
    });
    mkdirSync(join(root, "supabase", "functions", "nested", "beta"), {
      recursive: true,
    });
    writeFileSync(
      join(root, "supabase", "functions", "nested", "beta", "b.test.ts"),
      "",
    );
    writeFileSync(
      join(root, "supabase", "functions", "alpha", "a.test.ts"),
      "",
    );
    writeFileSync(
      join(root, "supabase", "functions", "alpha", "helper.ts"),
      "",
    );

    assert.deepEqual(
      collectTestFiles(functionsRootFor(root), { root }).sort(),
      [
        "supabase/functions/alpha/a.test.ts",
        "supabase/functions/nested/beta/b.test.ts",
      ],
    );
    assert.deepEqual(
      collectCheckFiles(functionsRootFor(root), { root }).sort(),
      ["supabase/functions/alpha/helper.ts"],
    );
  } finally {
    cleanup();
  }
});

test("buildDenoArgs pins permissions and appends discovered tests", () => {
  const args = buildDenoArgs(["supabase/functions/example/contract.test.ts"]);

  assert.equal(args[0], "test");
  assert.ok(args.includes("--no-prompt"));
  assert.ok(args.includes("--no-lock"));
  assert.ok(args.includes("--node-modules-dir=auto"));
  assert.ok(args.includes("--allow-read=supabase"));
  assert.ok(
    args.some(
      (arg) =>
        arg.startsWith("--allow-env=") &&
        arg.includes("SUPABASE_SERVICE_ROLE_KEY") &&
        arg.includes("OGL_LICENSE_SIGNING_KEY"),
    ),
  );
  assert.equal(args.at(-1), "supabase/functions/example/contract.test.ts");
  assert.deepEqual(
    buildDenoCheckArgs(["supabase/functions/example/index.ts"]),
    [
      "check",
      "--no-lock",
      "--node-modules-dir=auto",
      "supabase/functions/example/index.ts",
    ],
  );
  assert.match(functionsEnvExample, /^PRESENCE_POLL_TIMEOUT_MS=8000$/m);
  assert.doesNotMatch(
    functionsEnvExample,
    /^(SUCCESS_URL|CANCEL_URL|RESEND_API_KEY|PRICE_DROP_FROM_EMAIL|OGL_LICENSE_VERIFYING_KEY)=/m,
  );
  assert.match(functionsEnvExample, /^OGL_LICENSE_SIGNING_KEY=/m);
  assert.match(launcherEnvExample, /^OGL_LICENSE_VERIFYING_KEY=/m);
});

test("runSupabaseFunctionsTests runs deno from the repo root", () => {
  const { root, cleanup } = tempRepo();
  const calls = [];
  try {
    mkdirSync(join(root, "supabase", "functions", "edge"), {
      recursive: true,
    });
    writeFileSync(
      join(root, "supabase", "functions", "edge", "edge.test.ts"),
      "",
    );

    const status = runSupabaseFunctionsTests({
      logger: silentLogger(),
      root,
      runCommand(command, args, options) {
        calls.push({ args, command, options });
        if (command === "deno" && args[0] === "--version") {
          return { status: 0, stdout: `deno ${denoVersion}\n` };
        }
        return { status: 0 };
      },
    });

    assert.equal(status, 0);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].command, "deno");
    assert.deepEqual(calls[0].args, ["--version"]);
    assert.equal(calls[0].options.stdio, "pipe");
    assert.equal(calls[0].options.cwd, root);
    assert.equal(calls[1].command, "deno");
    assert.equal(calls[1].options.cwd, root);
    assert.ok(calls[1].args.includes("supabase/functions/edge/edge.test.ts"));

    writeFileSync(join(root, "supabase", "functions", "edge", "index.ts"), "");
    const checkStatus = runSupabaseFunctionsCheck({
      logger: silentLogger(),
      root,
      runCommand(command, args, options) {
        calls.push({ args, command, options });
        if (command === "deno" && args[0] === "--version") {
          return { status: 0, stdout: `deno ${denoVersion}\n` };
        }
        return { status: 0 };
      },
    });

    assert.equal(checkStatus, 0);
    assert.equal(calls[2].command, "deno");
    assert.deepEqual(calls[2].args, ["--version"]);
    assert.equal(calls[3].command, "deno");
    assert.equal(calls[3].args[0], "check");
    assert.ok(calls[3].args.includes("supabase/functions/edge/index.ts"));
  } finally {
    cleanup();
  }
});

test("runSupabaseFunctionsTests falls back to pinned npx deno when deno is missing", () => {
  const { root, cleanup } = tempRepo();
  const calls = [];
  try {
    assert.equal(denoNpmSpecifier, "deno@2.8.3");
    assert.equal(denoVersion, "2.8.3");
    assert.match(ciWorkflow, /deno-version:\s+v2\.8\.3/);

    mkdirSync(join(root, "supabase", "functions", "edge"), {
      recursive: true,
    });
    writeFileSync(
      join(root, "supabase", "functions", "edge", "edge.test.ts"),
      "",
    );

    const status = runSupabaseFunctionsTests({
      logger: silentLogger(),
      root,
      runCommand(command, args, options) {
        calls.push({ args, command, options });
        if (command === "deno") {
          return {
            error: Object.assign(new Error("missing"), { code: "ENOENT" }),
          };
        }
        return { status: 0 };
      },
    });

    assert.equal(status, 0);
    assert.deepEqual(
      calls.map((call) => call.command),
      ["deno", "npx"],
    );
    assert.deepEqual(calls[1].args.slice(0, 3), [
      "--yes",
      denoNpmSpecifier,
      "test",
    ]);
    assert.equal(calls[1].options.cwd, root);

    writeFileSync(join(root, "supabase", "functions", "edge", "index.ts"), "");
    const checkStatus = runSupabaseFunctionsCheck({
      logger: silentLogger(),
      root,
      runCommand(command, args, options) {
        calls.push({ args, command, options });
        if (command === "deno") {
          return {
            error: Object.assign(new Error("missing"), { code: "ENOENT" }),
          };
        }
        return { status: 0 };
      },
    });

    assert.equal(checkStatus, 0);
    assert.deepEqual(
      calls.slice(2).map((call) => call.command),
      ["deno", "npx"],
    );
    assert.deepEqual(calls[3].args.slice(0, 3), [
      "--yes",
      denoNpmSpecifier,
      "check",
    ]);
    assert.equal(calls[3].options.cwd, root);
  } finally {
    cleanup();
  }
});

test("runSupabaseFunctionsTests rejects ambient Deno version drift", () => {
  const { root, cleanup } = tempRepo();
  const calls = [];
  const errors = [];
  try {
    mkdirSync(join(root, "supabase", "functions", "edge"), {
      recursive: true,
    });
    writeFileSync(
      join(root, "supabase", "functions", "edge", "edge.test.ts"),
      "",
    );

    const status = runSupabaseFunctionsTests({
      logger: {
        error(message) {
          errors.push(message);
        },
        log() {},
      },
      root,
      runCommand(command, args, options) {
        calls.push({ args, command, options });
        if (command === "deno" && args[0] === "--version") {
          return { status: 0, stdout: "deno 2.9.0\n" };
        }
        throw new Error("must not run tests with an unpinned Deno version");
      },
    });

    assert.equal(status, 1);
    assert.deepEqual(
      calls.map((call) => call.command),
      ["deno"],
    );
    assert.match(errors.join("\n"), /Expected Deno 2\.8\.3; found 2\.9\.0/);
  } finally {
    cleanup();
  }
});

test("runSupabaseFunctionsTests fails cleanly without edge test files", () => {
  const { root, cleanup } = tempRepo();
  const errors = [];
  try {
    mkdirSync(join(root, "supabase", "functions"), { recursive: true });

    const status = runSupabaseFunctionsTests({
      logger: {
        error(message) {
          errors.push(message);
        },
        log() {},
      },
      root,
      runCommand() {
        throw new Error("should not run");
      },
    });

    assert.equal(status, 1);
    assert.deepEqual(errors, ["No Supabase Edge Function test files found."]);
    writeFileSync(join(root, "supabase", "functions", "edge.test.ts"), "");
    assert.equal(
      runSupabaseFunctionsCheck({
        logger: {
          error(message) {
            errors.push(message);
          },
          log() {},
        },
        root,
        runCommand() {
          throw new Error("should not run");
        },
      }),
      1,
    );
    assert.deepEqual(
      errors.at(-1),
      "No Supabase Edge Function source files found.",
    );
  } finally {
    cleanup();
  }
});
