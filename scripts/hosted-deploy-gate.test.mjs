import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  accountDeletionUserStorageBuckets,
  buildSchedulerPacket,
  buildDeployCommand,
  cronDryRunSmokes,
  deriveFunctionsBaseUrl,
  deployFunctions,
  getRuntimeSecretNames,
  getDeployFunctions,
  getSmokePlan,
  hostedDeployGatePacket,
  missingRequiredEnv,
  missingRuntimeSecretNames,
  optionsSmokes,
  parseSupabaseFunctionVerifyJwtConfig,
  parseSupabaseRuntimeSecretNames,
  parseArgs,
  runCronDryRunSmoke,
  runOptionsSmoke,
  runSmoke,
  runRuntimeSecretsPreflight,
  runVerifyJwtConfigPreflight,
  runtimeSecretNames,
  schedulerBaseUrlSetup,
  schedulerPlan,
  shouldRunHostedDeploySmoke,
  summarizePayload,
  validateSupabaseFunctionVerifyJwtConfig,
  validateSmokePayload,
} from "./hosted-deploy-gate.mjs";

const runbook = readFileSync(
  new URL("../docs/runbooks/hosted-deploy-gate.md", import.meta.url),
  "utf8",
);
const ciWorkflow = readFileSync(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);
const rootPackage = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const supabaseConfig = readFileSync(
  new URL("../supabase/config.toml", import.meta.url),
  "utf8",
);
const functionsDir = new URL("../supabase/functions/", import.meta.url);
const accountDeletionContract = readFileSync(
  new URL(
    "../supabase/functions/process-account-deletions/contract.ts",
    import.meta.url,
  ),
  "utf8",
);
const gateScriptPath = fileURLToPath(
  new URL("./hosted-deploy-gate.mjs", import.meta.url),
);
const plausibleSupabaseAccessToken =
  "sbp_0123456789abcdef0123456789abcdef01234567";
const plausibleAccountDeletionSecret =
  "account_deletion_0123456789abcdef0123456789";
const plausiblePresencePollSecret =
  "presence_poll_0123456789abcdef0123456789abcd";
const plausiblePriceDropSecret = "price_drop_0123456789abcdef0123456789abcdef";

function workflowInputBlock(inputName) {
  const marker = `      ${inputName}:\n`;
  const start = ciWorkflow.indexOf(marker);
  assert.notEqual(start, -1, `Workflow input ${inputName} not found.`);
  const bodyStart = start + marker.length;
  const next = ciWorkflow.slice(bodyStart).search(/^      [a-z_]+:\n/m);
  return ciWorkflow.slice(
    bodyStart,
    next === -1 ? undefined : bodyStart + next,
  );
}

function workflowStepBlock(stepName) {
  const marker = `      - name: ${stepName}\n`;
  const start = ciWorkflow.indexOf(marker);
  assert.notEqual(start, -1, `Workflow step ${stepName} not found.`);
  const bodyStart = start + marker.length;
  const next = ciWorkflow.slice(bodyStart).search(/^      - (?:name|uses): /m);
  return ciWorkflow.slice(start, next === -1 ? undefined : bodyStart + next);
}

function sortedSchedulerItems(items) {
  return [...items]
    .map(({ body, cadence, functionName, secretEnv }) => ({
      body,
      cadence,
      functionName,
      secretEnv,
    }))
    .sort((left, right) => left.functionName.localeCompare(right.functionName));
}

function sortedSchedulerPacketItems(items) {
  return [...items]
    .map(({ body, bodyJson, cadence, command, functionName, secretEnv }) => ({
      body,
      bodyJson,
      cadence,
      command,
      functionName,
      secretEnv,
    }))
    .sort((left, right) => left.functionName.localeCompare(right.functionName));
}

function schedulerItemsFromRunbook(markdown) {
  return [
    ...markdown.matchAll(
      /^- `([^`]+)`: (.+), Authorization: Bearer `\$([^`]+)`, body `([^`]+)`$/gm,
    ),
  ].map(([, functionName, cadence, secretEnv, body]) => ({
    body: JSON.parse(body),
    cadence,
    functionName,
    secretEnv,
  }));
}

function githubEnvironmentSecretsFromRunbook(markdown) {
  const match = markdown.match(
    /Create `hosted-staging` and `hosted-production` environments with:\n\n(?<list>(?:- `[^`]+`\n)+)/,
  );
  assert.ok(match?.groups?.list, "GitHub Environment secrets list not found.");
  return [...match.groups.list.matchAll(/- `([^`]+)`/g)].map(
    ([, name]) => name,
  );
}

function runtimeSecretsFromRunbook(markdown) {
  const match = markdown.match(
    /Runtime secrets must also exist in the Supabase project before deploy\/smoke:\n(?<body>[\s\S]*?)\n\n## Local Plan/,
  );
  assert.ok(match?.groups?.body, "Runtime secrets list not found.");
  return [...match.groups.body.matchAll(/`([^`]+)`/g)].map(([, name]) => name);
}

function assertIncludesAll(actual, expected) {
  for (const value of expected) {
    assert.ok(actual.includes(value), `Expected runbook to include ${value}.`);
  }
}

function accountDeletionBucketsFromContract(contractText) {
  const match = contractText.match(
    /ACCOUNT_DELETION_USER_STORAGE_BUCKETS\s*=\s*\[(?<body>[\s\S]*?)\]/,
  );
  assert.ok(
    match?.groups?.body,
    "Account deletion storage bucket list not found.",
  );
  return [...match.groups.body.matchAll(/"([^"]+)"/g)].map(([, name]) => name);
}

function createFakePnpmBin(secretNames) {
  const dir = mkdtempSync(join(tmpdir(), "ogl-hosted-deploy-gate-"));
  const fakePnpmPath = join(dir, "pnpm");
  const script = [
    "#!/usr/bin/env node",
    `const secretNames = ${JSON.stringify(secretNames)};`,
    'if (process.argv.includes("secrets") && process.argv.includes("list")) {',
    "  console.log(JSON.stringify({ secrets: secretNames.map((name) => ({ name })) }));",
    "  process.exit(0);",
    "}",
    'console.error("unexpected fake pnpm invocation");',
    "process.exit(1);",
    "",
  ].join("\n");
  writeFileSync(fakePnpmPath, script);
  chmodSync(fakePnpmPath, 0o755);
  writeFileSync(
    join(dir, "pnpm.cmd"),
    `@echo off\r\n"${process.execPath}" "%~dp0pnpm" %*\r\n`,
  );
  return dir;
}

function spawnDirectDeployDryRunWithRuntimeSecretNames(secretNames) {
  const fakeBin = createFakePnpmBin(secretNames);
  try {
    return spawnSync(process.execPath, [gateScriptPath, "deploy", "--dry-run"], {
      encoding: "utf8",
      env: {
        ...process.env,
        OGL_HOSTED_DEPLOY_FUNCTIONS: "process-account-deletions",
        PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ""}`,
        SUPABASE_ACCESS_TOKEN: plausibleSupabaseAccessToken,
        SUPABASE_PROJECT_REF: "awebfvfyqzwapcgixdfj",
      },
    });
  } finally {
    rmSync(fakeBin, { force: true, recursive: true });
  }
}

test("parseArgs rejects unknown actions without echoing them", () => {
  assert.deepEqual(parseArgs([]), { action: "plan", dryRunDeploy: false });
  assert.deepEqual(parseArgs(["deploy", "--dry-run"]), {
    action: "deploy",
    dryRunDeploy: true,
  });
  assert.deepEqual(parseArgs(["all", "--dry-run"]), {
    action: "all",
    dryRunDeploy: true,
  });
  assert.deepEqual(parseArgs(["scheduler-packet"]), {
    action: "scheduler-packet",
    dryRunDeploy: false,
  });
  assert.deepEqual(parseArgs(["packet"]), {
    action: "packet",
    dryRunDeploy: false,
  });
  assert.throws(
    () => parseArgs(["sk_live_should_not_echo_123456"]),
    (error) => {
      assert.match(error.message, /Unknown hosted deploy gate action/);
      assert.equal(error.message.includes("sk_live_should_not_echo"), false);
      return true;
    },
  );
});

test("parseArgs rejects extra positional actions without echoing them", () => {
  for (const argv of [
    ["deploy", "smoke"],
    ["deploy", "packet"],
    ["deploy", "sk_live_should_not_echo_123456"],
  ]) {
    assert.throws(
      () => parseArgs(argv),
      (error) => {
        assert.match(error.message, /Only one hosted deploy gate action/);
        assert.equal(error.message.includes("sk_live_should_not_echo"), false);
        return true;
      },
      argv.join(" "),
    );
  }
});

test("parseArgs rejects unknown flags without converting dry-run typos to live deploys", () => {
  for (const flag of ["--dryrun", "--dry_run", "--dry-run=true"]) {
    assert.throws(
      () => parseArgs(["deploy", flag]),
      (error) => {
        assert.match(error.message, /Unknown hosted deploy gate flag/);
        assert.equal(error.message.includes(flag), false);
        return true;
      },
      flag,
    );
  }
});

test("parseArgs rejects dry-run outside deploy-capable actions", () => {
  for (const action of [
    undefined,
    "plan",
    "packet",
    "preflight",
    "smoke",
    "scheduler-packet",
  ]) {
    const argv = action ? [action, "--dry-run"] : ["--dry-run"];
    assert.throws(
      () => parseArgs(argv),
      (error) => {
        assert.match(error.message, /--dry-run is only supported/);
        return true;
      },
      argv.join(" "),
    );
  }
});

test("package exposes explicit hosted deploy gate aliases", () => {
  assert.equal(
    rootPackage.scripts["hosted:deploy-gate"],
    "node scripts/hosted-deploy-gate.mjs",
  );
  assert.equal(
    rootPackage.scripts["hosted:deploy-gate:preflight"],
    "node scripts/hosted-deploy-gate.mjs preflight",
  );
  assert.equal(
    rootPackage.scripts["hosted:deploy-gate:deploy:dry-run"],
    "node scripts/hosted-deploy-gate.mjs deploy --dry-run",
  );
  assert.equal(
    rootPackage.scripts["hosted:deploy-gate:deploy:live"],
    "node scripts/hosted-deploy-gate.mjs deploy",
  );
  assert.equal(
    rootPackage.scripts["hosted:deploy-gate:smoke"],
    "node scripts/hosted-deploy-gate.mjs smoke",
  );
  assert.equal(
    rootPackage.scripts["hosted:deploy-gate:all:live"],
    "node scripts/hosted-deploy-gate.mjs all",
  );
  assert.equal(rootPackage.scripts["hosted:deploy-gate:deploy"], undefined);
});

test("CI workflow exposes hosted deploy dry-run dispatch input", () => {
  const block = workflowInputBlock("hosted_deploy_dry_run");

  assert.match(block, /required: false/);
  assert.match(block, /type: boolean/);
  assert.match(block, /default: false/);
});

test("CI workflow routes hosted deploy dry-run through deploy command", () => {
  const step = workflowStepBlock("Deploy hosted Supabase functions");

  assert.match(
    step,
    /if: inputs\.hosted_deploy_action == 'deploy' \|\| inputs\.hosted_deploy_action == 'all'/,
  );
  assert.match(step, /inputs\.hosted_deploy_dry_run|HOSTED_DEPLOY_DRY_RUN/);
  assert.match(step, /pnpm hosted:deploy-gate:deploy:dry-run/);
  assert.match(step, /pnpm hosted:deploy-gate:deploy:live\n/);
});

test("CI workflow gates production hosted deploy and smoke to main", () => {
  const step = workflowStepBlock("Validate hosted production source");

  assert.match(step, /inputs\.hosted_environment == 'hosted-production'/);
  assert.match(step, /inputs\.hosted_deploy_action == 'deploy'/);
  assert.match(step, /inputs\.hosted_deploy_action == 'smoke'/);
  assert.match(step, /inputs\.hosted_deploy_action == 'all'/);
  assert.match(step, /\$GITHUB_REF/);
  assert.match(step, /refs\/heads\/main/);
  assert.match(step, /git fetch --no-tags origin main/);
  assert.match(step, /HEAD_SHA="\$\(git rev-parse HEAD\)"/);
  assert.match(step, /MAIN_SHA="\$\(git rev-parse origin\/main\)"/);
  assert.match(
    step,
    /hosted-production deploy and smoke runs must use the current origin\/main commit/,
  );
  assert.doesNotMatch(step, /git merge-base --is-ancestor HEAD origin\/main/);
  assert.match(
    ciWorkflow,
    /hosted-deploy-gate:[\s\S]*actions\/checkout@[0-9a-f]{40} # v[0-9][^\n]*\n        with:\n          fetch-depth: 0/,
  );
  assert.ok(
    ciWorkflow.indexOf("- name: Validate hosted production source") <
      ciWorkflow.indexOf("- name: Hosted deploy gate preflight"),
    "Expected production source validation before hosted deploy preflight.",
  );
  assert.ok(
    ciWorkflow.indexOf("- name: Validate hosted production source") <
      ciWorkflow.indexOf("- name: Deploy hosted Supabase functions"),
    "Expected production source validation before hosted deploy.",
  );
  assert.ok(
    ciWorkflow.indexOf("- name: Validate hosted production source") <
      ciWorkflow.indexOf("- name: Smoke hosted Supabase functions"),
    "Expected production source validation before hosted smoke.",
  );
});

test("CI workflow runs production smoke-only through deploy preflight", () => {
  const step = workflowStepBlock("Hosted deploy gate preflight");

  assert.match(step, /inputs\.hosted_deploy_action == 'preflight'/);
  assert.match(step, /inputs\.hosted_deploy_action == 'deploy'/);
  assert.match(step, /inputs\.hosted_deploy_action == 'all'/);
  assert.match(
    step,
    /inputs\.hosted_environment == 'hosted-production' && inputs\.hosted_deploy_action == 'smoke'/,
  );
  assert.match(step, /pnpm hosted:deploy-gate:preflight/);
  assert.match(step, /SUPABASE_ACCESS_TOKEN:/);
});

test("CI workflow skips all-action smoke during hosted deploy dry-run only", () => {
  const step = workflowStepBlock("Smoke hosted Supabase functions");

  assert.match(step, /inputs\.hosted_deploy_action == 'smoke'/);
  assert.match(step, /pnpm hosted:deploy-gate:smoke/);
  assert.match(
    step,
    /\(inputs\.hosted_deploy_action == 'all' && !inputs\.hosted_deploy_dry_run\)/,
  );
  assert.doesNotMatch(
    step,
    /inputs\.hosted_deploy_action == 'smoke' && !inputs\.hosted_deploy_dry_run/,
  );
  assert.equal(shouldRunHostedDeploySmoke("smoke", true), true);
  assert.equal(shouldRunHostedDeploySmoke("all", false), true);
  assert.equal(shouldRunHostedDeploySmoke("all", true), false);
  assert.equal(shouldRunHostedDeploySmoke("deploy", true), false);
});

test("CI workflow passes hosted deploy function override to smoke step", () => {
  const step = workflowStepBlock("Smoke hosted Supabase functions");

  assert.match(step, /OGL_HOSTED_DEPLOY_FUNCTIONS:/);
  assert.match(step, /vars\.OGL_HOSTED_DEPLOY_FUNCTIONS/);
});

test("hosted deploy gate packet summarizes handoff without secret values", () => {
  const output = hostedDeployGatePacket({
    ACCOUNT_DELETION_PROCESSOR_SECRET: plausibleAccountDeletionSecret,
    PRESENCE_POLL_SECRET: plausiblePresencePollSecret,
    SUPABASE_ACCESS_TOKEN: plausibleSupabaseAccessToken,
    SUPABASE_PROJECT_REF: "awebfvfyqzwapcgixdfj",
    SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co",
  });

  assert.match(output, /Hosted deploy gate operator packet/);
  assert.match(output, /Function base URL: configured/);
  assert.match(
    output,
    new RegExp(
      `Deploy functions: ${deployFunctions.length}\/${deployFunctions.length} selected`,
    ),
  );
  assert.match(output, /Runtime Secret Names Checked By Preflight/);
  assert.doesNotMatch(output, /stripe-webhook/);
  assert.match(
    output,
    /poll-platform-presence: POST dry-run using PRESENCE_POLL_SECRET/,
  );
  assert.match(output, /Scheduler Handoff/);
  assert.match(output, /Scheduler base URL state: derive/);
  assert.match(output, /source env: SUPABASE_URL/);
  assert.match(
    output,
    /export SUPABASE_FUNCTIONS_URL="\$\{SUPABASE_URL%\/\}\/functions\/v1"/,
  );
  assert.match(output, /GitHub Workflow Dispatch/);
  assert.match(output, /Actions -> CI -> Run workflow/);
  assert.match(output, /hosted_deploy_gate=true/);
  assert.match(output, /hosted_environment=hosted-production/);
  assert.match(output, /hosted_deploy_action=all/);
  assert.match(output, /hosted_deploy_dry_run=false/);
  assert.match(output, /pnpm hosted:cron-evidence:packet/);
  for (const secret of [
    plausibleAccountDeletionSecret,
    plausiblePresencePollSecret,
    plausibleSupabaseAccessToken,
    "https://awebfvfyqzwapcgixdfj.supabase.co",
  ]) {
    assert.equal(output.includes(secret), false);
  }
  assert.equal(
    /sk_live_|whsec_|Bearer\s+[a-z0-9._~+/=-]{8,}/i.test(output),
    false,
  );
});

test("hosted deploy gate packet lists missing env names without failing", () => {
  const output = hostedDeployGatePacket({
    ACCOUNT_DELETION_PROCESSOR_SECRET: "set",
    SUPABASE_PROJECT_REF: "YOUR-PROJECT-REF",
  });

  assert.match(output, /Preflight env: missing/);
  assert.match(output, /Scheduler base URL state: missing/);
  assert.match(output, /SUPABASE_ACCESS_TOKEN/);
  assert.match(
    output,
    /SUPABASE_FUNCTIONS_URL or SUPABASE_URL or SUPABASE_PROJECT_REF/,
  );
  assert.equal(output.includes("YOUR-PROJECT-REF"), false);
});

test("hosted deploy gate packet mirrors scoped smoke plan", () => {
  const output = hostedDeployGatePacket({
    OGL_HOSTED_DEPLOY_FUNCTIONS: "rawg-assets",
    SUPABASE_ACCESS_TOKEN: plausibleSupabaseAccessToken,
    SUPABASE_PROJECT_REF: "awebfvfyqzwapcgixdfj",
  });

  assert.match(
    output,
    new RegExp(`Deploy functions: 1\/${deployFunctions.length} selected`),
  );
  assert.match(output, /rawg-assets \(verify_jwt=true\)/);
  assert.match(output, /rawg-assets: OPTIONS module\/env sanity/);
  assert.doesNotMatch(output, /poll-platform-presence: POST dry-run/);
  assert.doesNotMatch(output, /process-account-deletions: POST dry-run/);
  assert.doesNotMatch(output, /stripe-webhook/);
});

test("deriveFunctionsBaseUrl prefers explicit functions URL", () => {
  assert.equal(
    deriveFunctionsBaseUrl({
      SUPABASE_FUNCTIONS_URL:
        "https://awebfvfyqzwapcgixdfj.supabase.co/functions/v1/",
      SUPABASE_PROJECT_REF: "ignored",
      SUPABASE_URL: "https://ignored.supabase.co",
    }),
    "https://awebfvfyqzwapcgixdfj.supabase.co/functions/v1",
  );
  assert.equal(
    deriveFunctionsBaseUrl({
      SUPABASE_FUNCTIONS_URL: "placeholder",
      SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co/",
    }),
    "https://awebfvfyqzwapcgixdfj.supabase.co/functions/v1",
  );
});

test("deriveFunctionsBaseUrl rejects non-hosted Supabase and copied placeholders", () => {
  assert.equal(
    deriveFunctionsBaseUrl({
      SUPABASE_FUNCTIONS_URL:
        "http://awebfvfyqzwapcgixdfj.supabase.co/functions/v1",
      SUPABASE_PROJECT_REF: "YOUR-PROJECT-REF",
      SUPABASE_URL: "https://functions.example.test",
    }),
    "",
  );
  assert.equal(
    deriveFunctionsBaseUrl({
      SUPABASE_PROJECT_REF: "YOUR-PROJECT-REF",
    }),
    "",
  );
  assert.equal(deriveFunctionsBaseUrl({ SUPABASE_PROJECT_REF: "test" }), "");
  assert.equal(deriveFunctionsBaseUrl({ SUPABASE_PROJECT_REF: "abc" }), "");
  assert.equal(deriveFunctionsBaseUrl({ SUPABASE_PROJECT_REF: "abc123" }), "");
  assert.equal(
    deriveFunctionsBaseUrl({ SUPABASE_PROJECT_REF: "awebfvfyqzwapcgixdf-" }),
    "",
  );
  assert.equal(
    deriveFunctionsBaseUrl({ SUPABASE_URL: "https://abc.supabase.co" }),
    "",
  );
  assert.equal(
    deriveFunctionsBaseUrl({ SUPABASE_URL: "https://abc123.supabase.co" }),
    "",
  );
});

test("deriveFunctionsBaseUrl rejects credential-bearing or ambiguous URLs", () => {
  for (const value of [
    "https://user:secret@awebfvfyqzwapcgixdfj.supabase.co/functions/v1",
    "https://awebfvfyqzwapcgixdfj.supabase.co:8443/functions/v1",
    "https://awebfvfyqzwapcgixdfj.supabase.co/functions/v1?token=secret",
    "https://awebfvfyqzwapcgixdfj.supabase.co/functions/v1#secret",
    "https://awebfvfyqzwapcgixdfj.supabase.co/rest/v1",
  ]) {
    assert.equal(deriveFunctionsBaseUrl({ SUPABASE_FUNCTIONS_URL: value }), "");
  }

  for (const value of [
    "https://user:secret@awebfvfyqzwapcgixdfj.supabase.co",
    "https://awebfvfyqzwapcgixdfj.supabase.co:8443",
    "https://awebfvfyqzwapcgixdfj.supabase.co?token=secret",
    "https://awebfvfyqzwapcgixdfj.supabase.co#secret",
    "https://awebfvfyqzwapcgixdfj.supabase.co/functions/v1",
  ]) {
    assert.equal(deriveFunctionsBaseUrl({ SUPABASE_URL: value }), "");
  }
});

test("deriveFunctionsBaseUrl derives from Supabase URL", () => {
  assert.equal(
    deriveFunctionsBaseUrl({
      SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co/",
    }),
    "https://awebfvfyqzwapcgixdfj.supabase.co/functions/v1",
  );
});

test("preflight rejects mismatched hosted deploy project refs without echoing them", () => {
  const env = {
    ACCOUNT_DELETION_PROCESSOR_SECRET: plausibleAccountDeletionSecret,
    PRESENCE_POLL_SECRET: plausiblePresencePollSecret,
    SUPABASE_ACCESS_TOKEN: plausibleSupabaseAccessToken,
    SUPABASE_FUNCTIONS_URL:
      "https://bbbbbbbbbbbbbbbbbbbb.supabase.co/functions/v1",
    SUPABASE_PROJECT_REF: "awebfvfyqzwapcgixdfj",
    SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co",
  };

  const missing = missingRequiredEnv("preflight", env);

  assert.deepEqual(missing, [
    "SUPABASE_PROJECT_REF/SUPABASE_URL/SUPABASE_FUNCTIONS_URL project ref match",
  ]);
  assert.equal(JSON.stringify(missing).includes("awebfvfyqzwapcgixdfj"), false);
  assert.equal(JSON.stringify(missing).includes("bbbbbbbbbbbbbbbbbbbb"), false);
});

test("scheduler base setup reports explicit functions URL without printing it", () => {
  const setup = schedulerBaseUrlSetup({
    SUPABASE_FUNCTIONS_URL:
      "https://awebfvfyqzwapcgixdfj.supabase.co/functions/v1",
    SUPABASE_PROJECT_REF: "ignored",
    SUPABASE_URL: "https://ignored.supabase.co",
  });

  assert.deepEqual(setup, {
    missingEnv: [],
    setupCommand: "Use the configured SUPABASE_FUNCTIONS_URL value.",
    sourceEnv: "SUPABASE_FUNCTIONS_URL",
    state: "configured",
    targetEnv: "SUPABASE_FUNCTIONS_URL",
  });
  assert.equal(
    JSON.stringify(setup).includes("https://awebfvfyqzwapcgixdfj.supabase.co"),
    false,
  );
});

test("scheduler base setup derives redacted command from SUPABASE_URL", () => {
  const setup = schedulerBaseUrlSetup({
    SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co/",
  });

  assert.equal(setup.state, "derive");
  assert.equal(setup.sourceEnv, "SUPABASE_URL");
  assert.match(setup.setupCommand, /\$\{SUPABASE_URL%\/\}/);
  assert.equal(
    JSON.stringify(setup).includes("https://awebfvfyqzwapcgixdfj.supabase.co"),
    false,
  );
});

test("scheduler base setup derives redacted command from project ref", () => {
  const setup = schedulerBaseUrlSetup({
    SUPABASE_PROJECT_REF: "awebfvfyqzwapcgixdfj",
  });

  assert.equal(setup.state, "derive");
  assert.equal(setup.sourceEnv, "SUPABASE_PROJECT_REF");
  assert.match(setup.setupCommand, /\$SUPABASE_PROJECT_REF/);
  assert.equal(JSON.stringify(setup).includes("awebfvfyqzwapcgixdfj"), false);
});

test("scheduler base setup reports missing placeholders without printing them", () => {
  const setup = schedulerBaseUrlSetup({
    SUPABASE_FUNCTIONS_URL: "placeholder",
    SUPABASE_PROJECT_REF: "YOUR-PROJECT-REF",
    SUPABASE_URL: "todo",
  });

  assert.equal(setup.state, "missing");
  assert.deepEqual(setup.missingEnv, [
    "SUPABASE_FUNCTIONS_URL or SUPABASE_URL or SUPABASE_PROJECT_REF",
  ]);
  assert.equal(setup.sourceEnv, null);
  assert.equal(JSON.stringify(setup).includes("placeholder"), false);
  assert.equal(JSON.stringify(setup).includes("YOUR-PROJECT-REF"), false);
  assert.equal(JSON.stringify(setup).includes("todo"), false);
});

test("scheduler packet blocks commands when hosted target refs mismatch", () => {
  const packet = buildSchedulerPacket(schedulerPlan, {
    SUPABASE_FUNCTIONS_URL:
      "https://bbbbbbbbbbbbbbbbbbbb.supabase.co/functions/v1",
    SUPABASE_PROJECT_REF: "awebfvfyqzwapcgixdfj",
    SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co",
  });
  const output = JSON.stringify(packet);

  assert.equal(packet.baseUrlSetup.state, "mismatch");
  assert.deepEqual(packet.baseUrlSetup.missingEnv, [
    "SUPABASE_PROJECT_REF/SUPABASE_URL/SUPABASE_FUNCTIONS_URL project ref match",
  ]);
  assert.equal(packet.baseUrlSetup.sourceEnv, null);
  assert.equal(output.includes("awebfvfyqzwapcgixdfj"), false);
  assert.equal(output.includes("bbbbbbbbbbbbbbbbbbbb"), false);
  assert.equal(output.includes("curl -fsS"), false);
  assert.equal(
    packet.items.every((item) => item.command === null && item.url === null),
    true,
  );
});

test("scheduler handoff runbook mirrors schedulerPlan commands", () => {
  assert.deepEqual(
    sortedSchedulerItems(schedulerItemsFromRunbook(runbook)),
    sortedSchedulerItems(schedulerPlan),
  );
});

test("scheduler packet mirrors schedulerPlan and runbook content", () => {
  const packet = buildSchedulerPacket(schedulerPlan, {
    SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co",
  });
  assert.equal(packet.source, "schedulerPlan");
  assert.match(packet.disclaimer, /does not create schedulers/i);
  assert.match(packet.disclaimer, /does not prove external scheduler success/i);
  assert.equal(packet.baseUrlSetup.state, "derive");
  assert.equal(packet.baseUrlSetup.sourceEnv, "SUPABASE_URL");
  assert.equal(
    JSON.stringify(packet).includes("https://awebfvfyqzwapcgixdfj.supabase.co"),
    false,
  );

  assert.deepEqual(
    sortedSchedulerItems(packet.items),
    sortedSchedulerItems(schedulerPlan),
  );
  assert.deepEqual(
    sortedSchedulerItems(packet.items),
    sortedSchedulerItems(schedulerItemsFromRunbook(runbook)),
  );

  for (const item of packet.items) {
    const expected = schedulerPlan.find(
      (planItem) => planItem.functionName === item.functionName,
    );
    assert.equal(item.bodyJson, JSON.stringify(expected.body));
    assert.deepEqual(JSON.parse(item.bodyJson), expected.body);
    assert.match(item.command, new RegExp(`/${item.functionName}"`));
    assert.match(
      item.command,
      new RegExp(`Authorization: Bearer \\$${item.secretEnv}`),
    );
    assert.match(item.command, new RegExp(`--data '${item.bodyJson}'`));
  }

  const accountDeletion = packet.items.find(
    (item) => item.functionName === "process-account-deletions",
  );
  assert.equal("dry_run" in accountDeletion.body, true);
  assert.equal("dryRun" in accountDeletion.body, false);
  assert.equal(accountDeletion.body.execute, true);
});

test("scheduler-packet command emits redacted config without secret values", () => {
  const secretValues = [
    plausiblePresencePollSecret,
    plausibleAccountDeletionSecret,
  ];
  const result = spawnSync(
    process.execPath,
    [gateScriptPath, "scheduler-packet"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        ACCOUNT_DELETION_PROCESSOR_SECRET: secretValues[1],
        PRESENCE_POLL_SECRET: secretValues[0],
      },
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  const packet = JSON.parse(result.stdout);
  assert.deepEqual(
    sortedSchedulerPacketItems(packet.items),
    sortedSchedulerPacketItems(buildSchedulerPacket().items),
  );

  for (const value of secretValues) {
    assert.equal(result.stdout.includes(value), false);
  }
  assert.equal(result.stdout.includes("smoke passes"), false);
  assert.equal(result.stdout.includes("Preflight OK"), false);
});

test("runbook documents the redacted scheduler-packet handoff", () => {
  assert.match(runbook, /pnpm hosted:deploy-gate:scheduler-packet/);
  assert.match(runbook, /redacted scheduler command\/config packet/i);
  assert.match(runbook, /does not create schedulers/i);
  assert.match(runbook, /does not prove\s+external scheduler success/i);
});

test("runbook documents hosted deploy dry-run limits", () => {
  assert.match(runbook, /hosted_deploy_dry_run/);
  assert.match(runbook, /pnpm hosted:deploy-gate:deploy:dry-run/);
  assert.match(runbook, /easy to distinguish/);
  assert.doesNotMatch(runbook, /hard to distinguish/);
  assert.match(runbook, /prints deploy commands/i);
  assert.match(runbook, /does not\s+deploy/i);
  assert.match(runbook, /does not mock secrets/i);
  assert.match(runbook, /does not count as Hosted-Deploy/i);
  assert.match(runbook, /Post-Deploy-Smoke-Proof/i);
  assert.match(runbook, /SUPABASE_ACCESS_TOKEN[^.\n]+sbp_/);
  assert.match(runbook, /32\+ token-safe/i);
});

test("scheduler plan uses dry-run smoke functions and bearer secrets", () => {
  const smokeSecretsByFunction = new Map(
    cronDryRunSmokes.map((smoke) => [smoke.name, smoke.secretEnv]),
  );
  const deployFunctionsByName = new Map(
    deployFunctions.map((fn) => [fn.name, fn]),
  );

  assert.deepEqual(
    [...smokeSecretsByFunction.keys()].sort(),
    schedulerPlan.map((item) => item.functionName).sort(),
  );

  for (const item of schedulerPlan) {
    assert.equal(smokeSecretsByFunction.get(item.functionName), item.secretEnv);
    assert.equal(
      deployFunctionsByName.get(item.functionName)?.verifyJwt,
      false,
    );
  }
});

test("runbook lists hosted cron secrets and required environment variables", () => {
  const schedulerSecrets = schedulerPlan.map((item) => item.secretEnv);
  const expectedEnvironmentSecrets = [
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_PROJECT_REF",
    "SUPABASE_URL",
    ...schedulerSecrets,
  ];
  const expectedRuntimeSecrets = ["SUPABASE_URL", ...schedulerSecrets];

  assertIncludesAll(
    githubEnvironmentSecretsFromRunbook(runbook),
    expectedEnvironmentSecrets,
  );
  assertIncludesAll(runtimeSecretsFromRunbook(runbook), [
    ...expectedRuntimeSecrets,
    ...runtimeSecretNames,
  ]);
});

test("runbook clarifies hosted Functions URL derivation options", () => {
  assert.match(
    runbook,
    /`SUPABASE_URL` stays in this required workflow secret set for workflow consistency\.[\s\S]*The hosted Functions base URL can still derive from[\s\S]*`SUPABASE_PROJECT_REF`[\s\S]*`SUPABASE_FUNCTIONS_URL`[\s\S]*same hosted Supabase project\./,
  );
});

test("runbook documents hosted smoke CORS origin override", () => {
  assert.match(runbook, /OGL_HOSTED_SMOKE_ORIGIN/);
  assert.match(runbook, /Access-Control-Allow-Origin/i);
  assert.match(runbook, /Access-Control-Allow-Methods/i);
});

test("runtime secret preflight parses Supabase CLI names without values", () => {
  assert.deepEqual(
    parseSupabaseRuntimeSecretNames(
      JSON.stringify({
        secrets: [
          { digest: "hidden", name: "SUPABASE_URL" },
          { name: "PRESENCE_POLL_SECRET" },
        ],
      }),
    ),
    ["PRESENCE_POLL_SECRET", "SUPABASE_URL"],
  );
  assert.deepEqual(
    parseSupabaseRuntimeSecretNames(`
      NAME                         | DIGEST
      SUPABASE_SERVICE_ROLE_KEY    | [hidden]
      RAWG_API_KEY=[hidden]
    `),
    ["RAWG_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
  );
});

test("runtime secret preflight checks names only and redacts CLI detail", () => {
  const present = runtimeSecretNames.filter(
    (name) => name !== "RAWG_API_KEY" && name !== "STEAM_WEB_API_KEY",
  );
  const env = {
    SUPABASE_ACCESS_TOKEN: plausibleSupabaseAccessToken,
    SUPABASE_PROJECT_REF: "awebfvfyqzwapcgixdfj",
  };
  const spawnCalls = [];
  const spawnImpl = (command, args, options) => {
    spawnCalls.push({ args, command, options });
    return {
      status: 0,
      stdout: present.map((name) => `${name}=secret-value`).join("\n"),
    };
  };

  assert.throws(
    () => runRuntimeSecretsPreflight(env, spawnImpl),
    (error) => {
      assert.match(error.message, /Missing Supabase runtime secret names/);
      assert.match(error.message, /RAWG_API_KEY/);
      assert.match(error.message, /STEAM_WEB_API_KEY/);
      assert.equal(error.message.includes("secret-value"), false);
      assert.equal(error.message.includes(plausibleSupabaseAccessToken), false);
      return true;
    },
  );
  assert.deepEqual(spawnCalls[0].args, [
    "--dir",
    "launcher",
    "exec",
    "supabase",
    "secrets",
    "list",
    "--project-ref",
    "awebfvfyqzwapcgixdfj",
  ]);
  assert.equal(spawnCalls[0].command, "pnpm");
  assert.equal(spawnCalls[0].options.env, env);
  assert.deepEqual(missingRuntimeSecretNames(runtimeSecretNames), []);
});

test("runtime secret preflight rejects CLI failures without echoing output", () => {
  assert.throws(
    () =>
      runRuntimeSecretsPreflight(
        {
          SUPABASE_ACCESS_TOKEN: plausibleSupabaseAccessToken,
          SUPABASE_PROJECT_REF: "awebfvfyqzwapcgixdfj",
        },
        () => ({
          status: 1,
          stderr: "raw token sk_live_should_not_echo_123456",
          stdout: "SUPABASE_URL=secret-value",
        }),
      ),
    (error) => {
      assert.match(
        error.message,
        /Supabase runtime secrets name preflight failed/,
      );
      assert.equal(error.message.includes("sk_live_should_not_echo"), false);
      assert.equal(error.message.includes("secret-value"), false);
      return true;
    },
  );
});

test("runtime secret preflight rejects short fake project refs before CLI", () => {
  let called = false;
  assert.throws(
    () =>
      runRuntimeSecretsPreflight(
        {
          SUPABASE_ACCESS_TOKEN: plausibleSupabaseAccessToken,
          SUPABASE_PROJECT_REF: "abc123",
        },
        () => {
          called = true;
          return { status: 0, stdout: "" };
        },
      ),
    (error) => {
      assert.match(error.message, /Missing required hosted deploy gate env/);
      assert.match(error.message, /SUPABASE_PROJECT_REF/);
      assert.equal(error.message.includes("abc123"), false);
      return true;
    },
  );
  assert.equal(called, false);
});

test("runtime secret preflight rejects weak Supabase access tokens before CLI", () => {
  for (const weakToken of [
    "configured-access-token",
    "short-token",
    "sbp_short",
  ]) {
    let called = false;
    assert.throws(
      () =>
        runRuntimeSecretsPreflight(
          {
            SUPABASE_ACCESS_TOKEN: weakToken,
            SUPABASE_PROJECT_REF: "awebfvfyqzwapcgixdfj",
          },
          () => {
            called = true;
            return { status: 0, stdout: "" };
          },
        ),
      (error) => {
        assert.match(error.message, /Missing required hosted deploy gate env/);
        assert.match(error.message, /SUPABASE_ACCESS_TOKEN/);
        assert.equal(error.message.includes(weakToken), false);
        return true;
      },
    );
    assert.equal(called, false);
  }
});

test("preflight requires deploy and dry-run smoke secrets", () => {
  assert.deepEqual(
    missingRequiredEnv("preflight", {
      SUPABASE_PROJECT_REF: "awebfvfyqzwapcgixdfj",
    }),
    [
      "SUPABASE_ACCESS_TOKEN",
      "ACCOUNT_DELETION_PROCESSOR_SECRET",
      "PRESENCE_POLL_SECRET",
    ],
  );
});

test("deploy function override scopes smoke plans consistently", () => {
  assert.deepEqual(
    getSmokePlan({
      OGL_HOSTED_DEPLOY_FUNCTIONS: "process-account-deletions,rawg-assets",
    }),
    {
      cronDryRunSmokes: [
        {
          body: { dry_run: true, limit: 1, triggerSource: "hosted_deploy_gate" },
          name: "process-account-deletions",
          secretEnv: "ACCOUNT_DELETION_PROCESSOR_SECRET",
        },
      ],
      optionsSmokes: [
        { name: "process-account-deletions" },
        { name: "rawg-assets" },
      ],
    },
  );
  assert.deepEqual(getSmokePlan({ OGL_HOSTED_DEPLOY_FUNCTIONS: "rawg-assets" }), {
    cronDryRunSmokes: [],
    optionsSmokes: [{ name: "rawg-assets" }],
  });
});

test("smoke env requirements follow scoped cron smoke selection", () => {
  assert.deepEqual(
    missingRequiredEnv("smoke", {
      OGL_HOSTED_DEPLOY_FUNCTIONS: "rawg-assets",
      SUPABASE_PROJECT_REF: "awebfvfyqzwapcgixdfj",
    }),
    [],
  );
  assert.deepEqual(
    missingRequiredEnv("smoke", {
      OGL_HOSTED_DEPLOY_FUNCTIONS: "process-account-deletions,rawg-assets",
      SUPABASE_PROJECT_REF: "awebfvfyqzwapcgixdfj",
    }),
    ["ACCOUNT_DELETION_PROCESSOR_SECRET"],
  );
});

test("plan command mirrors scoped smoke plan", () => {
  const result = spawnSync(process.execPath, [gateScriptPath, "plan"], {
    encoding: "utf8",
    env: {
      ...process.env,
      OGL_HOSTED_DEPLOY_FUNCTIONS: "rawg-assets",
      SUPABASE_PROJECT_REF: "awebfvfyqzwapcgixdfj",
    },
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /rawg-assets \(verify_jwt=true\)/);
  assert.match(result.stdout, /rawg-assets: OPTIONS module\/env sanity/);
  assert.doesNotMatch(result.stdout, /process-account-deletions: POST dry-run/);
  assert.doesNotMatch(result.stdout, /stripe-webhook/);
});

test("deploy env rejects short fake project refs as missing", () => {
  assert.deepEqual(
    missingRequiredEnv("deploy", {
      SUPABASE_ACCESS_TOKEN: plausibleSupabaseAccessToken,
      SUPABASE_PROJECT_REF: "abc123",
    }),
    ["SUPABASE_PROJECT_REF"],
  );
});

test("preflight and smoke reject placeholder env values without printing them", async () => {
  const placeholderEnv = {
    ACCOUNT_DELETION_PROCESSOR_SECRET: "set",
    PRESENCE_POLL_SECRET: "replace-with-random-cron-secret",
    SUPABASE_ACCESS_TOKEN: "placeholder",
    SUPABASE_PROJECT_REF: "YOUR-PROJECT-REF",
    SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co",
  };

  assert.deepEqual(missingRequiredEnv("preflight", placeholderEnv), [
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_PROJECT_REF",
    "ACCOUNT_DELETION_PROCESSOR_SECRET",
    "PRESENCE_POLL_SECRET",
  ]);

  let called = false;
  await assert.rejects(
    () =>
      runCronDryRunSmoke(
        {
          body: { dryRun: true, limit: 1 },
          name: "poll-platform-presence",
          secretEnv: "PRESENCE_POLL_SECRET",
        },
        placeholderEnv,
        async () => {
          called = true;
          return new Response("{}");
        },
      ),
    (error) => {
      assert.match(error.message, /Missing required hosted deploy gate env/);
      assert.equal(error.message.includes("replace-with-random"), false);
      assert.equal(error.message.includes("secret-value"), false);
      assert.equal(error.message.includes("placeholder"), false);
      assert.equal(error.message.includes("YOUR-PROJECT-REF"), false);
      return true;
    },
  );
  assert.equal(called, false);
});

test("preflight rejects weak auth env values without printing them", () => {
  const env = {
    ACCOUNT_DELETION_PROCESSOR_SECRET: "short-account-secret",
    PRESENCE_POLL_SECRET: plausiblePresencePollSecret,
    SUPABASE_ACCESS_TOKEN: "configured-access-token",
    SUPABASE_PROJECT_REF: "awebfvfyqzwapcgixdfj",
    SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co",
  };

  assert.deepEqual(missingRequiredEnv("preflight", env), [
    "SUPABASE_ACCESS_TOKEN",
    "ACCOUNT_DELETION_PROCESSOR_SECRET",
  ]);
});

test("dry-run smoke rejects weak cron secrets before fetch", async () => {
  for (const weakSecret of ["configured-presence-secret", "short-secret"]) {
    let called = false;
    await assert.rejects(
      () =>
        runCronDryRunSmoke(
          {
            body: { dryRun: true, limit: 1 },
            name: "poll-platform-presence",
            secretEnv: "PRESENCE_POLL_SECRET",
          },
          {
            PRESENCE_POLL_SECRET: weakSecret,
            SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co",
          },
          async () => {
            called = true;
            return new Response("{}");
          },
        ),
      (error) => {
        assert.match(error.message, /Missing required hosted deploy gate env/);
        assert.match(error.message, /PRESENCE_POLL_SECRET/);
        assert.equal(error.message.includes(weakSecret), false);
        return true;
      },
    );
    assert.equal(called, false);
  }
});

test("dry-run smoke rejects non-Supabase function base URLs before fetch", async () => {
  let called = false;
  await assert.rejects(
    () =>
      runCronDryRunSmoke(
        {
          body: { dryRun: true, limit: 1 },
          name: "poll-platform-presence",
          secretEnv: "PRESENCE_POLL_SECRET",
        },
        {
          PRESENCE_POLL_SECRET: plausiblePresencePollSecret,
          SUPABASE_FUNCTIONS_URL: "https://functions.example.test",
          SUPABASE_PROJECT_REF: "YOUR-PROJECT-REF",
          SUPABASE_URL: "http://awebfvfyqzwapcgixdfj.supabase.co",
        },
        async () => {
          called = true;
          return new Response("{}");
        },
      ),
    (error) => {
      assert.match(error.message, /Missing required hosted deploy gate env/);
      assert.match(
        error.message,
        /SUPABASE_FUNCTIONS_URL or SUPABASE_URL or SUPABASE_PROJECT_REF/,
      );
      assert.equal(error.message.includes("functions.example.test"), false);
      assert.equal(error.message.includes("YOUR-PROJECT-REF"), false);
      assert.equal(error.message.includes(plausiblePresencePollSecret), false);
      return true;
    },
  );
  assert.equal(called, false);
});

test("dry-run smoke rejects missing functions base URL before fetch", async () => {
  let called = false;
  await assert.rejects(
    () =>
      runCronDryRunSmoke(
        {
          body: { dryRun: true, limit: 1 },
          name: "poll-platform-presence",
          secretEnv: "PRESENCE_POLL_SECRET",
        },
        {
          PRESENCE_POLL_SECRET: plausiblePresencePollSecret,
        },
        async () => {
          called = true;
          return new Response("{}");
        },
      ),
    (error) => {
      assert.match(error.message, /Missing required hosted deploy gate env/);
      assert.match(
        error.message,
        /SUPABASE_FUNCTIONS_URL or SUPABASE_URL or SUPABASE_PROJECT_REF/,
      );
      assert.equal(error.message.includes(plausiblePresencePollSecret), false);
      return true;
    },
  );
  assert.equal(called, false);
});

test("dry-run smoke rejects placeholder-only functions base URL before fetch", async () => {
  let called = false;
  await assert.rejects(
    () =>
      runCronDryRunSmoke(
        {
          body: { dryRun: true, limit: 1 },
          name: "poll-platform-presence",
          secretEnv: "PRESENCE_POLL_SECRET",
        },
        {
          PRESENCE_POLL_SECRET: plausiblePresencePollSecret,
          SUPABASE_FUNCTIONS_URL: "placeholder",
          SUPABASE_PROJECT_REF: "set",
          SUPABASE_URL: "todo",
        },
        async () => {
          called = true;
          return new Response("{}");
        },
      ),
    (error) => {
      assert.match(error.message, /Missing required hosted deploy gate env/);
      assert.match(
        error.message,
        /SUPABASE_FUNCTIONS_URL or SUPABASE_URL or SUPABASE_PROJECT_REF/,
      );
      assert.equal(error.message.includes(plausiblePresencePollSecret), false);
      assert.equal(error.message.includes("placeholder"), false);
      assert.equal(error.message.includes("todo"), false);
      return true;
    },
  );
  assert.equal(called, false);
});

test("dry-run smoke rejects missing smoke secret before fetch", async () => {
  let called = false;
  await assert.rejects(
    () =>
      runCronDryRunSmoke(
        {
          body: { dryRun: true, limit: 1 },
          name: "poll-platform-presence",
          secretEnv: "PRESENCE_POLL_SECRET",
        },
        {
          SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co",
        },
        async () => {
          called = true;
          return new Response("{}");
        },
      ),
    (error) => {
      assert.match(error.message, /Missing required hosted deploy gate env/);
      assert.match(error.message, /PRESENCE_POLL_SECRET/);
      assert.equal(
        error.message.includes("https://awebfvfyqzwapcgixdfj.supabase.co"),
        false,
      );
      return true;
    },
  );
  assert.equal(called, false);
});

test("deploy command disables JWT verification for cron functions", () => {
  assert.deepEqual(
    buildDeployCommand(
      { name: "poll-platform-presence", verifyJwt: false },
      { SUPABASE_PROJECT_REF: "awebfvfyqzwapcgixdfj" },
    ),
    {
      args: [
        "--dir",
        "launcher",
        "exec",
        "supabase",
        "functions",
        "deploy",
        "poll-platform-presence",
        "--project-ref",
        "awebfvfyqzwapcgixdfj",
        "--no-verify-jwt",
      ],
      command: "pnpm",
    },
  );
});

test("deploy command rejects short fake project refs without echoing them", () => {
  assert.throws(
    () =>
      buildDeployCommand(
        { name: "poll-platform-presence", verifyJwt: false },
        { SUPABASE_PROJECT_REF: "abc123" },
      ),
    (error) => {
      assert.match(error.message, /Missing required hosted deploy gate env/);
      assert.match(error.message, /SUPABASE_PROJECT_REF/);
      assert.equal(error.message.includes("abc123"), false);
      return true;
    },
  );
});

test("direct deploy dry-run runs verify_jwt config preflight before deploy commands", () => {
  const result =
    spawnDirectDeployDryRunWithRuntimeSecretNames(runtimeSecretNames);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /Preflight OK for action: deploy/);
  assert.match(result.stdout, /Supabase function verify_jwt config OK/);
  assert.match(result.stdout, /Supabase runtime secret names OK/);
  assert.match(result.stdout, /supabase functions deploy process-account-deletions/);
  assert.ok(
    result.stdout.indexOf("Supabase function verify_jwt config OK") <
      result.stdout.indexOf("supabase functions deploy process-account-deletions"),
  );
  assert.ok(
    result.stdout.indexOf("Supabase runtime secret names OK") <
      result.stdout.indexOf("supabase functions deploy process-account-deletions"),
  );
});

test("direct deploy dry-run stops before deploy commands when runtime secrets are missing", () => {
  const result = spawnDirectDeployDryRunWithRuntimeSecretNames(
    runtimeSecretNames.filter((name) => name !== "RAWG_API_KEY"),
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing Supabase runtime secret names/);
  assert.match(result.stderr, /RAWG_API_KEY/);
  assert.equal(
    result.stdout.includes("supabase functions deploy poll-platform-presence"),
    false,
  );
});

test("direct deploy dry-run rejects short fake project refs before commands", () => {
  const result = spawnSync(
    process.execPath,
    [gateScriptPath, "deploy", "--dry-run"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        OGL_HOSTED_DEPLOY_FUNCTIONS: "poll-platform-presence",
        SUPABASE_ACCESS_TOKEN: plausibleSupabaseAccessToken,
        SUPABASE_PROJECT_REF: "abc123",
      },
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing required hosted deploy gate env/);
  assert.match(result.stderr, /SUPABASE_PROJECT_REF/);
  assert.equal(result.stderr.includes("abc123"), false);
  assert.equal(
    result.stdout.includes("supabase functions deploy poll-platform-presence"),
    false,
  );
});

test("deploy plan covers every Supabase Edge Function directory", () => {
  const functionDirs = readdirSync(functionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(deployFunctions.map((fn) => fn.name).sort(), functionDirs);
});

test("Steam presence preflight keeps its API key", () => {
  assert.equal(
    getRuntimeSecretNames({
      OGL_HOSTED_DEPLOY_FUNCTIONS: "poll-platform-presence",
    }).includes("STEAM_WEB_API_KEY"),
    true,
  );
  for (const obsoleteName of [
    "STEAM_OPENID_RETURN_TO",
    "STEAM_OPENID_REALM",
    "STEAM_ACCOUNT_LINK_STATE_SECRET",
  ]) {
    assert.equal(runtimeSecretNames.includes(obsoleteName), false);
  }
});

test("Supabase function config parser reads explicit verify_jwt values", () => {
  const entries = parseSupabaseFunctionVerifyJwtConfig(`
    [functions.poll-platform-presence]
    verify_jwt = false

    [functions.store-download-build]
    verify_jwt = true
  `);

  assert.deepEqual(
    [...entries.entries()].map(([name, entry]) => [name, entry.verifyJwt]),
    [
      ["poll-platform-presence", false],
      ["store-download-build", true],
    ],
  );
});

test("Supabase function config validator rejects missing and mismatched verify_jwt entries", () => {
  const result = validateSupabaseFunctionVerifyJwtConfig(
    `
    [functions.poll-platform-presence]
    verify_jwt = true

    [functions.store-download-build]
    `,
    [
      { name: "poll-platform-presence", verifyJwt: false },
    ],
  );

  assert.deepEqual(result.errors, [
    "Supabase config [functions.poll-platform-presence] verify_jwt=true does not match deploy plan verify_jwt=false.",
  ]);
});

test("Supabase config verify_jwt entries mirror the hosted deploy plan", () => {
  const result = validateSupabaseFunctionVerifyJwtConfig(supabaseConfig);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    [...result.entries.keys()].sort(),
    deployFunctions.map((fn) => fn.name).sort(),
  );
});

test("hosted deploy preflight rejects verify_jwt config drift", () => {
  assert.throws(
    () =>
      runVerifyJwtConfigPreflight(
        `
        [functions.poll-platform-presence]
        verify_jwt = true
        `,
        [{ name: "poll-platform-presence", verifyJwt: false }],
      ),
    /Supabase function verify_jwt config preflight failed/,
  );
});

test("OPTIONS smokes cover every deployed function without mutation", () => {
  assert.deepEqual(
    optionsSmokes.map((smoke) => smoke.name).sort(),
    deployFunctions.map((fn) => fn.name).sort(),
  );
});

test("account deletion dry-run bucket expectation mirrors the Edge Function contract", () => {
  assert.deepEqual(
    accountDeletionUserStorageBuckets,
    accountDeletionBucketsFromContract(accountDeletionContract),
  );
  assert.equal(accountDeletionUserStorageBuckets.includes("screenshots"), false);
});

test("deploy function override rejects unknown function names", () => {
  assert.throws(
    () =>
      getDeployFunctions({
        OGL_HOSTED_DEPLOY_FUNCTIONS:
          "poll-platform-presence,eyJsec...oken",
      }),
    (error) => {
      assert.match(error.message, /Unknown function/);
      assert.equal(error.message.includes("eyJsecret_should_not_echo"), false);
      return true;
    },
  );
});

test("deploy function override rejects an explicit empty function selection", () => {
  assert.throws(
    () => getDeployFunctions({ OGL_HOSTED_DEPLOY_FUNCTIONS: "," }),
    (error) => {
      assert.match(error.message, /OGL_HOSTED_DEPLOY_FUNCTIONS/);
      assert.match(error.message, /at least one function/);
      return true;
    },
  );
});

test("dry-run smoke validation rejects mutating responses", () => {
  assert.deepEqual(
    validateSmokePayload("process-account-deletions", {
      dryRun: false,
      failedCount: 1,
      processed: [{ id: "request-1" }],
      processedCount: 1,
      storageBuckets: "avatars",
    }),
    [
      "dryRun must be true.",
      "processedCount must be 0.",
      "failedCount must be 0.",
      "processed must be an empty array.",
      "storageBuckets must be present.",
      "evidenceRecorded must be true.",
      "runId must be present.",
      "triggerSource must be hosted_deploy_gate.",
    ],
  );

  assert.deepEqual(
    validateSmokePayload("process-account-deletions", {
      dryRun: true,
      evidenceRecorded: true,
      failedCount: 0,
      processed: [],
      processedCount: 0,
      runId: "account-deletion-run-1",
      storageBuckets: [],
      triggerSource: "hosted_deploy_gate",
    }),
    ["storageBuckets must list all account deletion user storage buckets."],
  );

  assert.deepEqual(
    validateSmokePayload("poll-platform-presence", {
      activityInserted: 1,
      dryRun: false,
      evidenceRecorded: false,
      presenceUpdated: 1,
      runId: "",
      triggerSource: "manual",
    }),
    [
      "dryRun must be true.",
      "presenceUpdated must be 0.",
      "activityInserted must be 0.",
      "evidenceRecorded must be true.",
      "runId must be present.",
      "triggerSource must be hosted_deploy_gate.",
    ],
  );
});

test("dry-run smoke validation rejects unsafe run IDs without echoing them", async () => {
  for (const unsafeRunId of [
    "sk_live_should_not_echo_1234567890",
    "sk_test_should_not_echo_1234567890",
    "whsec_should_not_echo_1234567890",
    "Bearer abcdefghijklmnop",
    "eyJsecretShouldNotEcho1234567890.payloadShouldNotEcho1234567890.signatureShouldNotEcho1234567890",
    "PRESENCE_POLL_SECRET",
  ]) {
    const errors = validateSmokePayload("poll-platform-presence", {
      activityInserted: 0,
      dryRun: true,
      evidenceRecorded: true,
      presenceUpdated: 0,
      runId: unsafeRunId,
      triggerSource: "hosted_deploy_gate",
    });

    assert.deepEqual(errors, ["runId must be a safe evidence identifier."]);
    assert.equal(errors.join(" ").includes(unsafeRunId), false);
  }

  assert.deepEqual(
    validateSmokePayload("poll-platform-presence", {
      activityInserted: 0,
      dryRun: true,
      evidenceRecorded: true,
      presenceUpdated: 0,
      runId: "presence-poll-run-1",
      triggerSource: "hosted_deploy_gate",
    }),
    [],
  );
  assert.deepEqual(
    validateSmokePayload("poll-platform-presence", {
      activityInserted: 0,
      dryRun: true,
      evidenceRecorded: true,
      presenceUpdated: 0,
      runId: "7d68b23b-9469-43df-86a8-e22c91f9c8bb",
      triggerSource: "hosted_deploy_gate",
    }),
    [],
  );

  await assert.rejects(
    () =>
      runCronDryRunSmoke(
        {
          body: { dryRun: true, limit: 1 },
          name: "poll-platform-presence",
          secretEnv: "PRESENCE_POLL_SECRET",
        },
        {
          PRESENCE_POLL_SECRET: plausiblePresencePollSecret,
          SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co",
        },
        async () =>
          new Response(
            JSON.stringify({
              activityInserted: 0,
              dryRun: true,
              evidenceRecorded: true,
              presenceUpdated: 0,
              runId:
                "eyJsecretShouldNotEcho1234567890.payloadShouldNotEcho1234567890.signatureShouldNotEcho1234567890",
              triggerSource: "hosted_deploy_gate",
            }),
            { status: 200 },
          ),
      ),
    (error) => {
      assert.match(error.message, /runId must be a safe evidence identifier/);
      assert.equal(error.message.includes("sk_live_should_not_echo"), false);
      assert.equal(error.message.includes("eyJsecretShouldNotEcho"), false);
      return true;
    },
  );

  assert.deepEqual(summarizePayload({ runId: "sk_live_should_not_echo" }), {
    runId: "[redacted-invalid-run-id]",
  });
});

test("runCronDryRunSmoke sends bearer secret and validates response", async () => {
  const calls = [];
  const result = await runCronDryRunSmoke(
    {
      body: { dryRun: true, limit: 1 },
      name: "poll-platform-presence",
      secretEnv: "PRESENCE_POLL_SECRET",
    },
    {
      PRESENCE_POLL_SECRET: plausiblePresencePollSecret,
      SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co",
    },
    async (url, init) => {
      calls.push({ init, url });
      return new Response(
        JSON.stringify({
          activityInserted: 0,
          dryRun: true,
          evidenceRecorded: true,
          polled: 0,
          presenceUpdated: 0,
          runId: "presence-run-1",
          scanned: 0,
          skipped: [],
          triggerSource: "hosted_deploy_gate",
        }),
        { status: 200 },
      );
    },
  );

  assert.equal(
    calls[0].url,
    "https://awebfvfyqzwapcgixdfj.supabase.co/functions/v1/poll-platform-presence",
  );
  assert.equal(
    calls[0].init.headers.Authorization,
    `Bearer ${plausiblePresencePollSecret}`,
  );
  assert.deepEqual(result, {
    name: "poll-platform-presence",
    status: 200,
    summary: {
      activityInserted: 0,
      dryRun: true,
      evidenceRecorded: true,
      polled: 0,
      presenceUpdated: 0,
      runId: "presence-run-1",
      scanned: 0,
      skipped: 0,
      triggerSource: "hosted_deploy_gate",
    },
    type: "cron-dry-run",
  });
});

test("runCronDryRunSmoke accepts account deletion dry-run only with expected buckets", async () => {
  const result = await runCronDryRunSmoke(
    {
      body: { dry_run: true, limit: 1 },
      name: "process-account-deletions",
      secretEnv: "ACCOUNT_DELETION_PROCESSOR_SECRET",
    },
    {
      ACCOUNT_DELETION_PROCESSOR_SECRET: plausibleAccountDeletionSecret,
      SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co",
    },
    async () =>
      new Response(
        JSON.stringify({
          dryRun: true,
          evidenceRecorded: true,
          failedCount: 0,
          processed: [],
          processedCount: 0,
          runId: "account-deletion-run-1",
          storageBuckets: [...accountDeletionUserStorageBuckets].reverse(),
          triggerSource: "hosted_deploy_gate",
          wouldProcess: [],
        }),
        { status: 200 },
      ),
  );

  assert.deepEqual(result.summary, {
    dryRun: true,
    evidenceRecorded: true,
    processedCount: 0,
    runId: "account-deletion-run-1",
    triggerSource: "hosted_deploy_gate",
    wouldProcess: 0,
  });
});

test("runOptionsSmoke validates CORS origin and methods", async () => {
  const calls = [];
  const result = await runOptionsSmoke(
    { name: "rawg-assets" },
    {
      OGL_HOSTED_SMOKE_ORIGIN: "https://launcher.example",
      SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co",
    },
    async (url, init) => {
      calls.push({ init, url });
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Methods": "GET, OPTIONS, POST",
          "Access-Control-Allow-Origin": "https://launcher.example",
        },
        status: 200,
      });
    },
  );

  assert.equal(
    calls[0].url,
    "https://awebfvfyqzwapcgixdfj.supabase.co/functions/v1/rawg-assets",
  );
  assert.equal(calls[0].init.headers.Origin, "https://launcher.example");
  assert.deepEqual(result, {
    name: "rawg-assets",
    status: 200,
    summary: {},
    type: "options",
  });

  await assert.rejects(
    () =>
      runOptionsSmoke(
        { name: "rawg-assets" },
        {
          OGL_HOSTED_SMOKE_ORIGIN: "https://launcher.example",
          SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co",
        },
        async () =>
          new Response(null, {
            headers: {
              "Access-Control-Allow-Origin": "https://unexpected.example",
            },
            status: 200,
          }),
      ),
    (error) => {
      assert.match(error.message, /Access-Control-Allow-Origin/);
      assert.equal(error.message.includes("launcher.example"), false);
      assert.equal(error.message.includes("unexpected.example"), false);
      return true;
    },
  );

  await assert.rejects(
    () =>
      runOptionsSmoke(
        { name: "rawg-assets" },
        { SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co" },
        async () =>
          new Response(null, {
            headers: {
              "Access-Control-Allow-Methods": "GET, POST",
              "Access-Control-Allow-Origin": "*",
            },
            status: 200,
          }),
      ),
    /Access-Control-Allow-Methods must include OPTIONS/,
  );
});

test("ingest-achievements OPTIONS smoke requires the attestation contract header", async () => {
  const env = { SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co" };
  const smoke = optionsSmokes.find(
    (item) => item.name === "ingest-achievements",
  );
  assert.ok(smoke);

  await assert.rejects(
    () =>
      runOptionsSmoke(
        smoke,
        env,
        async () =>
          new Response(null, {
            headers: {
              "Access-Control-Allow-Headers":
                "authorization, x-account-deletion-secret, x-client-info, apikey, content-type",
              "Access-Control-Allow-Methods": "GET, OPTIONS, POST",
              "Access-Control-Allow-Origin": "*",
            },
            status: 200,
          }),
      ),
    /Access-Control-Allow-Headers must include x-achievement-attestation/,
  );

  const result = await runOptionsSmoke(
    smoke,
    env,
    async () =>
      new Response(null, {
        headers: {
          "Access-Control-Allow-Headers":
            "authorization, x-achievement-attestation, x-client-info, apikey, content-type",
          "Access-Control-Allow-Methods": "GET, OPTIONS, POST",
          "Access-Control-Allow-Origin": "*",
        },
        status: 200,
      }),
  );
  assert.equal(result.status, 200);
});

test("runSmoke executes only scoped smoke plan", async () => {
  const calls = [];
  const originalLog = console.log;

  try {
    console.log = () => {};
    await runSmoke(
      {
        OGL_HOSTED_DEPLOY_FUNCTIONS: "rawg-assets",
        SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co",
      },
      async (url, init) => {
        calls.push({ method: init.method, url });
        return new Response(null, {
          headers: { "Access-Control-Allow-Origin": "*" },
          status: 200,
        });
      },
    );
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(calls, [
    {
      method: "OPTIONS",
      url: "https://awebfvfyqzwapcgixdfj.supabase.co/functions/v1/rawg-assets",
    },
  ]);
});

test("smoke failures redact response bodies", async () => {
  await assert.rejects(
    () =>
      runCronDryRunSmoke(
        {
          body: { dryRun: true, limit: 1 },
          name: "poll-platform-presence",
          secretEnv: "PRESENCE_POLL_SECRET",
        },
        {
          PRESENCE_POLL_SECRET: plausiblePresencePollSecret,
          SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co",
        },
        async () =>
          new Response(
            JSON.stringify({
              message: "user-id-123 secret-value should not echo",
              rawUserId: "user-id-123",
            }),
            { status: 500 },
          ),
      ),
    (error) => {
      assert.match(error.message, /HTTP 500/);
      assert.match(error.message, /JSON object keys: message, rawUserId/);
      assert.equal(error.message.includes("user-id-123"), false);
      assert.equal(error.message.includes("secret-value"), false);
      return true;
    },
  );

  await assert.rejects(
    () =>
      runOptionsSmoke(
        { name: "rawg-assets" },
        { SUPABASE_URL: "https://awebfvfyqzwapcgixdfj.supabase.co" },
        async () =>
          new Response("plain text secret-value should not echo", {
            status: 500,
          }),
      ),
    (error) => {
      assert.match(error.message, /HTTP 500/);
      assert.match(error.message, /JSON object keys: raw/);
      assert.equal(error.message.includes("plain text"), false);
      assert.equal(error.message.includes("secret-value"), false);
      return true;
    },
  );

  let called = false;
  await assert.rejects(
    () =>
      runOptionsSmoke(
        { name: "rawg-assets" },
        {
          SUPABASE_FUNCTIONS_URL:
            "https://bbbbbbbbbbbbbbbbbbbb.supabase.co/functions/v1",
          SUPABASE_PROJECT_REF: "awebfvfyqzwapcgixdfj",
        },
        async () => {
          called = true;
          return new Response("{}");
        },
      ),
    (error) => {
      assert.match(error.message, /Missing required hosted deploy gate env/);
      assert.match(
        error.message,
        /SUPABASE_PROJECT_REF\/SUPABASE_URL\/SUPABASE_FUNCTIONS_URL project ref match/,
      );
      assert.equal(error.message.includes("awebfvfyqzwapcgixdfj"), false);
      assert.equal(error.message.includes("bbbbbbbbbbbbbbbbbbbb"), false);
      return true;
    },
  );
  assert.equal(called, false);
});
