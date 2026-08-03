import {
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const migrationUrl = new URL(
  "../../migrations/20260717122000_harden_provider_matching_and_privacy.sql",
  import.meta.url,
);

Deno.test("provider matching trusts only aligned server verification records", async () => {
  const migration = normalizeSql(await Deno.readTextFile(migrationUrl));

  assertStringIncludes(
    migration,
    "drop trigger if exists auto_match_on_platform_link on public.platform_accounts;",
  );
  assertStringIncludes(
    migration,
    "drop function if exists public.auto_match_friend_links();",
  );
  assertStringIncludes(
    migration,
    "before insert or update on public.provider_account_verifications for each row execute function private.enforce_provider_verification_consistency();",
  );

  const resolver = functionBlock(
    migration,
    "private.verified_friend_link_match_user(",
  );
  assertStringIncludes(
    resolver,
    "from public.provider_account_verifications as verification",
  );
  assertStringIncludes(
    resolver,
    "having count(distinct verification.user_id) = 1",
  );

  const reconciler = functionBlock(
    migration,
    "private.reconcile_verified_friend_link_matches()",
  );
  assertStringIncludes(
    reconciler,
    "where link.match_method = 'linked_account'",
  );
  assertStringIncludes(
    reconciler,
    "is distinct from link.matched_user_id",
  );
  assertStringIncludes(reconciler, "where link.matched_user_id is null");

  assertStringIncludes(
    migration,
    "after insert or update or delete on public.provider_account_verifications for each statement execute function private.reconcile_friend_links_after_verification();",
  );
  assertStringIncludes(
    migration,
    "after insert or update of platform, platform_friend_id, merge_group_id or delete on public.friend_links for each statement execute function private.reconcile_friend_links_after_import();",
  );
  assertStringIncludes(
    migration,
    "linked-account matches require a verified provider identity.",
  );

  const platformPolicy = policyBlock(
    migration,
    "platform_accounts_select_own",
    "platform_accounts",
  );
  assertStringIncludes(platformPolicy, "user_id = (select auth.uid())");
  assertStringIncludes(
    migration,
    "revoke select on table public.platform_accounts from anon;",
  );
});

Deno.test("presence polling cache is service-only and cannot re-enter account metadata", async () => {
  const migration = normalizeSql(await Deno.readTextFile(migrationUrl));

  assertStringIncludes(
    migration,
    "create table if not exists public.platform_presence_poll_cache",
  );
  assertStringIncludes(
    migration,
    "references public.provider_account_verifications(platform_account_id) on delete cascade",
  );
  assertStringIncludes(
    migration,
    "alter table public.platform_presence_poll_cache enable row level security;",
  );
  assertStringIncludes(
    migration,
    "revoke all on table public.platform_presence_poll_cache from public, anon, authenticated;",
  );
  assertStringIncludes(
    migration,
    "grant select, insert, update, delete on table public.platform_presence_poll_cache to service_role;",
  );
  assertStringIncludes(
    migration,
    "join public.provider_account_verifications as verification on verification.platform_account_id = account.id",
  );
  assertStringIncludes(
    migration,
    "new.metadata := coalesce(new.metadata, '{}'::jsonb) - 'presencepollcache';",
  );
  assertStringIncludes(
    migration,
    "update public.platform_accounts set metadata = metadata - 'presencepollcache' where metadata ? 'presencepollcache';",
  );
});

Deno.test("public privacy wrappers bind viewers while private helpers are not executable", async () => {
  const migration = normalizeSql(await Deno.readTextFile(migrationUrl));

  for (
    const signature of [
      "private.is_friend(uuid, uuid)",
      "private.is_blocked(uuid, uuid)",
      "private.can_view_visibility(uuid, uuid, text)",
      "private.can_view_profile(uuid, uuid)",
      "private.can_view_online_status(uuid, uuid)",
      "private.can_view_game_activity(uuid, uuid)",
      "private.can_view_achievements(uuid, uuid)",
    ]
  ) {
    assertStringIncludes(
      migration,
      `revoke execute on function ${signature} from public, anon, authenticated;`,
    );
  }

  for (
    const functionName of [
      "can_view_visibility",
      "can_view_profile",
      "can_view_online_status",
      "can_view_game_activity",
      "can_view_achievements",
    ]
  ) {
    const block = functionBlock(migration, `public.${functionName}(`);
    assertStringIncludes(block, "security definer");
    assertStringIncludes(
      block,
      "when viewer_id is distinct from auth.uid() then false",
    );
    assertStringIncludes(block, `private.${functionName}(auth.uid(),`);
  }

  for (const functionName of ["is_friend", "is_blocked"]) {
    const block = functionBlock(migration, `public.${functionName}(`);
    assertStringIncludes(block, "security definer");
    assertStringIncludes(block, "auth.uid()");
    assertStringIncludes(block, `private.${functionName}(`);
  }
});

function functionBlock(source: string, signature: string) {
  const start = source.indexOf(`create or replace function ${signature}`);
  if (start === -1) {
    throw new Error(`Missing function ${signature}`);
  }
  const end = source.indexOf("$$;", start);
  if (end === -1) {
    throw new Error(`Function ${signature} has no body terminator`);
  }
  return source.slice(start, end + 3);
}

function policyBlock(source: string, policyName: string, tableName: string) {
  const start = source.indexOf(
    `create policy ${policyName} on public.${tableName}`,
  );
  if (start === -1) {
    throw new Error(`Missing policy ${policyName}`);
  }
  const end = source.indexOf(";", start);
  if (end === -1) {
    throw new Error(`Policy ${policyName} has no terminator`);
  }
  return source.slice(start, end + 1);
}

function normalizeSql(source: string) {
  return source.toLowerCase().replace(/\s+/g, " ").trim();
}
