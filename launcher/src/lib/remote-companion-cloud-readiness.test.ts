// @vitest-environment node

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { getRemoteCompanionCloudReadiness } from "./remote-companion-cloud-readiness";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260611110000_remote_companion_contract.sql",
    import.meta.url,
  ),
  "utf8",
);
const compactMigration = migration.replace(/\s+/g, " ");

function extractMigrationFunction(name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = migration.match(
    new RegExp(`create or replace function public\\.${escapedName}\\b[\\s\\S]*?\\n\\$\\$;`, "i"),
  );

  return match?.[0].replace(/\s+/g, " ") ?? "";
}

describe("remote companion cloud readiness", () => {
  it("keeps hosted deployment as the blocker while relay code is staged", () => {
    const readiness = getRemoteCompanionCloudReadiness({
      hasDesktopSecretVault: true,
      hasHostedDeployment: false,
      hasOpaqueJobQueue: true,
      hasPairingRpc: true,
      hasRelayFunction: true,
      hasSchemaRls: true,
      hasStoreBuildTicketContract: true,
    });

    expect(readiness).toMatchObject({
      progress: 86,
      tone: "blocked",
    });
    expect(readiness.blocker).toEqual(
      expect.objectContaining({
        id: "hosted-deploy",
        label: "Hosted Deploy",
        status: "blocked",
      }),
    );
  });

  it("reports ready when schema, RPCs, opaque jobs, relay, desktop vault and hosted deploy are present", () => {
    const readiness = getRemoteCompanionCloudReadiness({
      hasDesktopSecretVault: true,
      hasHostedDeployment: true,
      hasOpaqueJobQueue: true,
      hasPairingRpc: true,
      hasRelayFunction: true,
      hasSchemaRls: true,
      hasStoreBuildTicketContract: true,
    });

    expect(readiness).toMatchObject({
      blocker: null,
      progress: 100,
      tone: "ready",
    });
    expect(readiness.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "schema-rls", status: "ready" }),
        expect.objectContaining({ id: "pairing-rpc", status: "ready" }),
        expect.objectContaining({ id: "opaque-jobs", status: "ready" }),
        expect.objectContaining({ id: "store-ticket-jobs", status: "ready" }),
        expect.objectContaining({ id: "relay-function", status: "ready" }),
        expect.objectContaining({ id: "desktop-vault", status: "ready" }),
        expect.objectContaining({ id: "hosted-deploy", status: "ready" }),
      ]),
    );
  });
});

describe("remote companion migration contract", () => {
  it("stages owner-scoped companion tables with RLS and no direct writes", () => {
    expect(migration).toMatch(/create table if not exists public\.remote_companion_devices/i);
    expect(migration).toMatch(/create table if not exists public\.remote_install_jobs/i);
    expect(migration).toMatch(
      /alter table public\.remote_companion_devices enable row level security/i,
    );
    expect(migration).toMatch(/alter table public\.remote_install_jobs enable row level security/i);
    expect(migration).toMatch(/grant select on public\.remote_companion_devices to authenticated/i);
    expect(migration).toMatch(/grant select on public\.remote_install_jobs to authenticated/i);
    expect(migration).not.toMatch(
      /grant\s+(insert|update|delete|all).*public\.remote_(companion_devices|install_jobs).*authenticated/i,
    );
  });

  it("exposes hashed pairing and opaque install-job RPCs only to signed-in users", () => {
    for (const rpc of [
      "create_remote_companion_pairing",
      "redeem_remote_companion_pairing",
      "record_remote_companion_ping",
      "enqueue_remote_install_job",
      "claim_remote_install_jobs",
      "update_remote_install_job_status",
    ]) {
      expect(migration).toMatch(new RegExp(`create or replace function public\\.${rpc}`, "i"));
      expect(migration).toMatch(new RegExp(`grant execute on function public\\.${rpc}`, "i"));
    }

    expect(migration).toMatch(/security definer/i);
    expect(migration).toMatch(/digest\(generated_code, 'sha256'\)/i);
    expect(migration).toMatch(/device_secret_hash text not null/i);
    expect(migration).toMatch(/digest\(generated_device_secret, 'sha256'\)/i);
    expect(migration).toMatch(
      /claim_remote_install_jobs\(\s*device_id_input uuid,\s*device_secret_input text/i,
    );
    expect(migration).toMatch(
      /record_remote_companion_ping\(\s*device_id_input uuid,\s*device_secret_input text/i,
    );
    expect(migration).toMatch(/downloadTicketRequired/i);
    expect(migration).not.toMatch(/\b(downloadUrl|installManifestUrl|signedUrl)\b/);
  });

  it("rejects package locations inside remote job metadata", () => {
    expect(migration).toMatch(/position\('http:\/\/' in lower\(package_ref::text\)\) = 0/i);
    expect(migration).toMatch(/position\('https:\/\/' in lower\(package_ref::text\)\) = 0/i);
    expect(migration).toMatch(/position\('downloadurl' in lower\(package_ref::text\)\) = 0/i);
    expect(migration).toMatch(
      /position\('installmanifesturl' in lower\(package_ref::text\)\) = 0/i,
    );
    expect(migration).toMatch(/position\('signedurl' in lower\(package_ref::text\)\) = 0/i);
    expect(migration).toMatch(/position\('token=' in lower\(package_ref::text\)\) = 0/i);
    expect(migration).toMatch(/package_ref_text ~ '\(https\?:\/\/\|download_url\|downloadurl/i);
  });

  it("enforces store-build ticket package refs at the enqueue RPC boundary", () => {
    const enqueueRpc = extractMigrationFunction("enqueue_remote_install_job");

    expect(enqueueRpc).toContain(
      "if (product_id_input is not null or build_id_input is not null) then",
    );
    expect(enqueueRpc).toContain(
      "safe_package_ref ->> 'delivery' is distinct from 'store-build-ticket'",
    );
    expect(enqueueRpc).toContain(
      "safe_package_ref -> 'downloadTicketRequired' is distinct from 'true'::jsonb",
    );
    expect(enqueueRpc).toContain(
      "raise exception 'Store remote install jobs require a store-build-ticket package reference.';",
    );
    expect(enqueueRpc).toContain("if build_id_input is not null and product_id_input is null then");
    expect(enqueueRpc).toContain(
      "raise exception 'Store remote install jobs require a store product id.';",
    );
  });

  it("makes terminal remote install jobs immutable at the table boundary", () => {
    expect(compactMigration).toContain(
      "create or replace function public.enforce_remote_install_job_terminal_immutability()",
    );
    expect(compactMigration).toContain(
      "if old.status in ('completed', 'failed', 'cancelled', 'expired') then",
    );
    expect(compactMigration).toContain(
      "raise exception 'Remote install job is terminal and cannot be changed.';",
    );
    expect(compactMigration).toContain(
      "create trigger enforce_remote_install_jobs_terminal_immutability before update on public.remote_install_jobs for each row when (old.status in ('completed', 'failed', 'cancelled', 'expired')) execute function public.enforce_remote_install_job_terminal_immutability();",
    );
    expect(compactMigration).toContain(
      "revoke execute on function public.enforce_remote_install_job_terminal_immutability() from public, anon, authenticated;",
    );
  });

  it("allows only sensible remote install job status transitions", () => {
    const statusRpc = extractMigrationFunction("update_remote_install_job_status");

    expect(statusRpc).toContain(
      "effective_status not in ('started', 'completed', 'failed', 'cancelled')",
    );
    expect(statusRpc).toContain(
      "terminal_statuses text[] := array['completed', 'failed', 'cancelled', 'expired'];",
    );
    expect(statusRpc).toContain("for update of job;");
    expect(statusRpc).toContain("if job_row.status = any (terminal_statuses) then");
    expect(statusRpc).toContain(
      "job_row.status = 'accepted' and effective_status in ('started', 'failed', 'cancelled')",
    );
    expect(statusRpc).toContain(
      "job_row.status = 'started' and effective_status in ('completed', 'failed', 'cancelled')",
    );
    expect(statusRpc).toContain(
      "raise exception 'Remote install job status transition is not allowed.';",
    );
    expect(statusRpc).not.toMatch(
      /job_row\.status = 'pending' and effective_status in \([^)]*completed/i,
    );
    expect(statusRpc).not.toMatch(
      /job_row\.status = 'accepted' and effective_status in \([^)]*completed/i,
    );
  });
});
